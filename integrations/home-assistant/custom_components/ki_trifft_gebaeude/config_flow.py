"""Einrichtung: Serveradresse und Kopplungscode aus der App eingeben."""
from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.const import __version__ as HA_VERSION
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import BridgeClient, BridgeError
from .const import CONF_BUILDING, CONF_CODE, CONF_LINK_ID, CONF_SERVER, CONF_TOKEN, DOMAIN
from .payload import normalize_server


class KITrifftGebaeudeConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            try:
                server = normalize_server(user_input[CONF_SERVER])
            except ValueError as err:
                errors[CONF_SERVER] = str(err)
            else:
                client = BridgeClient(async_get_clientsession(self.hass), server)
                try:
                    result = await client.pair(user_input[CONF_CODE], self.hass.config.location_name or "", HA_VERSION)
                except BridgeError as err:
                    errors["base"] = {401: "invalid_code", 400: "invalid_code", 429: "rate_limited"}.get(err.status, "cannot_connect")
                else:
                    await self.async_set_unique_id(result["link_id"])
                    self._abort_if_unique_id_configured()
                    # Nur der eigene Brückenschlüssel wird gespeichert, kein Home-Assistant-Zugang verlässt das System.
                    return self.async_create_entry(
                        title=f"KI trifft Gebäude · {result.get('building', '')}".strip(" ·"),
                        data={CONF_SERVER: server, CONF_TOKEN: result["token"], CONF_LINK_ID: result["link_id"], CONF_BUILDING: result.get("building", "")},
                    )
        schema = vol.Schema({
            vol.Required(CONF_SERVER, default=(user_input or {}).get(CONF_SERVER, "")): str,
            vol.Required(CONF_CODE): str,
        })
        return self.async_show_form(step_id="user", data_schema=schema, errors=errors)
