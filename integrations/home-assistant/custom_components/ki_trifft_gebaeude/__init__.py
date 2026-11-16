"""KI trifft Gebäude: ausgewählte Sensorwerte an den Projektserver schicken (nur ausgehend)."""
from __future__ import annotations

import logging
from datetime import timedelta

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.components import persistent_notification
from homeassistant.exceptions import ConfigEntryError, ConfigEntryNotReady
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .api import BridgeClient, BridgeError
from .const import CONF_SERVER, CONF_TOKEN, DOMAIN, HISTORY_DAYS, INVENTORY_INTERVAL_MINUTES, PUSH_INTERVAL_SECONDS
from .payload import build_history, build_inventory, build_states

_LOGGER = logging.getLogger(__name__)


class Bridge:
    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.hass = hass
        self.entry = entry
        self.client = BridgeClient(async_get_clientsession(hass), entry.data[CONF_SERVER], entry.data[CONF_TOKEN])
        self.store = Store(hass, 1, f"{DOMAIN}.{entry.entry_id}")
        self.selected: set[str] = set()
        self.history_done: set[str] = set()
        self.last_sent: dict[str, str] = {}
        self.paused = False

    async def async_start(self) -> None:
        stored = await self.store.async_load() or {}
        self.history_done = set(stored.get("history_done", []))
        try:
            await self.async_send_inventory()
        except BridgeError as err:
            if err.status == 401:
                raise ConfigEntryError("Die Verbindung wurde in der App getrennt. Bitte die Integration entfernen und mit neuem Code einrichten.") from err
            raise ConfigEntryNotReady(str(err)) from err
        self.entry.async_on_unload(async_track_time_interval(self.hass, self._push, timedelta(seconds=PUSH_INTERVAL_SECONDS)))
        self.entry.async_on_unload(async_track_time_interval(self.hass, self._inventory, timedelta(minutes=INVENTORY_INTERVAL_MINUTES)))

    def _sensors(self) -> tuple[list[dict], dict[str, dict], dict[str, str]]:
        entities, devices, areas = er.async_get(self.hass), dr.async_get(self.hass), ar.async_get(self.hass)
        sensors = []
        for state in self.hass.states.async_all("sensor"):
            entry = entities.async_get(state.entity_id)
            sensors.append({
                "entity_id": state.entity_id,
                "name": state.name,
                "device_class": state.attributes.get("device_class"),
                "unit": state.attributes.get("unit_of_measurement"),
                "device_id": entry.device_id if entry else None,
                "area_id": entry.area_id if entry else None,
            })
        device_map = {
            d.id: {"name": d.name_by_user or d.name or "", "manufacturer": d.manufacturer or "", "model": d.model or "", "area_id": d.area_id}
            for d in devices.devices.values()
        }
        area_map = {a.id: a.name for a in areas.async_list_areas()}
        return sensors, device_map, area_map

    def _apply_selection(self, result: dict) -> None:
        if isinstance(result.get("selected"), list):
            self.selected = {x for x in result["selected"] if isinstance(x, str)}

    async def async_send_inventory(self) -> None:
        sensors, devices, areas = self._sensors()
        self._apply_selection(await self.client.inventory(build_inventory(sensors, devices, areas)))
        await self._backfill()

    async def _inventory(self, _now=None) -> None:
        if self.paused:
            return
        try:
            await self.async_send_inventory()
        except BridgeError as err:
            self._handle(err)

    async def _push(self, _now=None) -> None:
        if self.paused or not self.selected:
            return
        states = [
            {"entity_id": s.entity_id, "state": s.state, "last_updated": s.last_updated}
            for s in self.hass.states.async_all("sensor") if s.entity_id in self.selected
        ]
        payload = build_states(states, self.selected, self.last_sent)
        if not payload:
            return
        try:
            result = await self.client.states(payload)
        except BridgeError as err:
            self._handle(err)
            return
        for item in payload:
            self.last_sent[item["entity_id"]] = item["measured_at"]
        before = set(self.selected)
        self._apply_selection(result)
        if self.selected - before:
            await self._backfill()

    async def _backfill(self) -> None:
        """Stundenwerte der letzten Tage für neu ausgewählte Sensoren einmalig nachliefern."""
        missing = sorted(self.selected - self.history_done)
        if not missing or "recorder" not in self.hass.config.components:
            return
        from homeassistant.components.recorder import get_instance
        from homeassistant.components.recorder.statistics import statistics_during_period

        end = dt_util.utcnow()
        start = end - timedelta(days=HISTORY_DAYS)
        stats = await get_instance(self.hass).async_add_executor_job(
            statistics_during_period, self.hass, start, end, set(missing), "hour", None, {"mean", "state"},
        )
        try:
            for chunk in build_history(stats, set(missing)):
                await self.client.history(chunk)
        except BridgeError as err:
            # Tageslimit erreicht oder Server weg: beim nächsten Abgleich erneut versuchen.
            _LOGGER.info("Verlauf wird später nachgeliefert: %s", err)
            return
        self.history_done.update(missing)
        await self.store.async_save({"history_done": sorted(self.history_done)})

    @callback
    def _handle(self, err: BridgeError) -> None:
        if err.status == 401:
            self.paused = True
            _LOGGER.warning("Die Verbindung wurde in der App getrennt. Bitte die Integration neu einrichten.")
            persistent_notification.async_create(
                self.hass,
                "Die Verbindung zu „KI trifft Gebäude“ wurde getrennt. Es werden keine Werte mehr gesendet. "
                "Zum erneuten Verbinden die Integration entfernen und mit einem neuen Kopplungscode einrichten.",
                title="KI trifft Gebäude", notification_id=f"{DOMAIN}_{self.entry.entry_id}",
            )
        elif err.status == 429:
            _LOGGER.debug("Limit erreicht, Werte werden später gesendet: %s", err)
        else:
            _LOGGER.warning("KI trifft Gebäude nicht erreichbar: %s", err)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    bridge = Bridge(hass, entry)
    await bridge.async_start()
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = bridge
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)
    return True


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Beim Entfernen in Home Assistant auch die Verbindung samt Daten auf dem Server löschen."""
    client = BridgeClient(async_get_clientsession(hass), entry.data[CONF_SERVER], entry.data[CONF_TOKEN])
    try:
        await client.unlink()
    except BridgeError as err:
        _LOGGER.warning("Verbindung konnte auf dem Server nicht gelöscht werden (%s). Bitte in der App trennen.", err)
    await Store(hass, 1, f"{DOMAIN}.{entry.entry_id}").async_remove()
