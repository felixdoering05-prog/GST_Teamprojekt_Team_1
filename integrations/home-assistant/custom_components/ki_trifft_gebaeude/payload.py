"""Reine Hilfsfunktionen ohne Home-Assistant-Abhängigkeit (testbar mit unittest).

Hier wird entschieden, welche Daten Home Assistant für Raumklima, Strom und Wasser meldet.
Die unterstützten Einheiten werden pro Sensorklasse geprüft.
"""
from __future__ import annotations

import math
import re
from datetime import datetime, timezone
from typing import Any, Iterable

# device_class -> erlaubte Einheiten (muss zum Server passen: dashboard/backend/src/ha-import.js)
ALLOWED_UNITS: dict[str, set[str]] = {
    "temperature": {"°C", "°F", "K"},
    "humidity": {"%"},
    "carbon_dioxide": {"ppm"},
    "power": {"W", "kW"},
    "energy": {"Wh", "kWh", "MWh"},
    "battery": {"%"},
    "water": {"L", "m³", "gal", "ft³", "CCF", "MCF"},
    "volume_flow_rate": {"mL/s", "L/s", "L/min", "L/h", "m³/s", "m³/min", "m³/h"},
    "volume_storage": {"mL", "L", "m³", "gal", "ft³"},
    "irradiance": {"W/m²"},
}
ENTITY_RE = re.compile(r"^sensor\.[a-z0-9_]{1,200}$")
REF_RE = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")
MAX_ENTITIES = 500
MAX_STATES = 200
MAX_HISTORY_POINTS = 2000


def _text(value: Any, limit: int = 100) -> str:
    if not isinstance(value, str):
        return ""
    return re.sub(r"[\x00-\x1f\x7f]", " ", value).strip()[:limit]


def _ref(value: Any) -> str | None:
    return value if isinstance(value, str) and REF_RE.match(value) else None


def allowed(entity_id: str, device_class: Any, unit: Any) -> bool:
    return bool(ENTITY_RE.match(entity_id or "")) and unit in ALLOWED_UNITS.get(device_class, set())


def build_inventory(sensors: Iterable[dict], devices: dict[str, dict], areas: dict[str, str]) -> dict:
    """sensors: [{entity_id, name, device_class, unit, device_id, area_id}] (area_id = Bereich der Entität selbst).

    Gibt nur erlaubte Sensoren zurück, dazu genau die Geräte und Bereiche, die diese brauchen.
    Der Bereich einer Entität überschreibt wie in Home Assistant den Bereich des Geräts.
    """
    entities: list[dict] = []
    used_devices: dict[str, dict] = {}
    used_areas: dict[str, str] = {}
    for sensor in sorted(sensors, key=lambda s: s.get("entity_id", "")):
        entity_id = sensor.get("entity_id", "")
        if not allowed(entity_id, sensor.get("device_class"), sensor.get("unit")):
            continue
        if len(entities) >= MAX_ENTITIES:
            break
        device_id = _ref(sensor.get("device_id"))
        device = devices.get(device_id) if device_id else None
        area_id = _ref(sensor.get("area_id")) or (_ref(device.get("area_id")) if device else None)
        if area_id and area_id not in areas:
            area_id = None
        if device_id and device is None:
            device_id = None
        if device_id:
            device_area = _ref(device.get("area_id"))
            used_devices[device_id] = {
                "device_id": device_id,
                "name": _text(device.get("name")) or device_id,
                "manufacturer": _text(device.get("manufacturer")),
                "model": _text(device.get("model")),
                "area_id": device_area if device_area in areas else None,
            }
            if device_area in areas:
                used_areas[device_area] = areas[device_area]
        if area_id:
            used_areas[area_id] = areas[area_id]
        entities.append({
            "entity_id": entity_id,
            "name": _text(sensor.get("name")) or entity_id,
            "device_class": sensor["device_class"],
            "unit": sensor["unit"],
            "device_id": device_id,
            "area_id": area_id,
        })
    return {
        "areas": [{"area_id": k, "name": _text(v) or k} for k, v in sorted(used_areas.items())],
        "devices": sorted(used_devices.values(), key=lambda d: d["device_id"]),
        "entities": entities,
    }


def iso(moment: datetime | float | int) -> str:
    if isinstance(moment, (int, float)):
        moment = datetime.fromtimestamp(moment, tz=timezone.utc)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc).isoformat(timespec="milliseconds")


def number(value: Any) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def build_states(states: Iterable[dict], selected: set[str], last_sent: dict[str, str]) -> list[dict]:
    """states: [{entity_id, state, last_updated(datetime)}]. Nur ausgewählte, numerische, geänderte Werte."""
    out: list[dict] = []
    for item in states:
        entity_id = item.get("entity_id")
        if entity_id not in selected:
            continue
        value = number(item.get("state"))
        if value is None:
            continue  # unknown / unavailable
        stamp = iso(item["last_updated"])
        if last_sent.get(entity_id) == stamp:
            continue
        out.append({"entity_id": entity_id, "value": value, "measured_at": stamp})
        if len(out) >= MAX_STATES:
            break
    return out


def build_history(statistics: dict[str, list[dict]], selected: set[str]) -> list[list[dict]]:
    """Stundenstatistik aus dem Recorder in Pakete zu höchstens 2000 Punkten aufteilen.

    statistics: {entity_id: [{start, mean?, state?}]}. Für Messwerte zählt der Mittelwert,
    für Zählerstände (Energie) der Stand am Ende der Stunde.
    """
    points: list[dict] = []
    for entity_id in sorted(statistics):
        if entity_id not in selected:
            continue
        for row in statistics[entity_id]:
            value = number(row.get("mean"))
            if value is None:
                value = number(row.get("state"))
            start = row.get("start")
            if value is None or start is None:
                continue
            points.append({"entity_id": entity_id, "value": value, "measured_at": iso(start)})
    return [points[i:i + MAX_HISTORY_POINTS] for i in range(0, len(points), MAX_HISTORY_POINTS)]


def normalize_server(url: str) -> str:
    """Basisadresse inkl. API-Pfad, z. B. https://server.example/app-api/v1. Nur HTTPS (außer lokal)."""
    url = (url or "").strip().rstrip("/")
    match = re.match(r"^(https?)://([^/?#@\s]+)(/[^?#\s]*)?$", url)
    if not match:
        raise ValueError("invalid_url")
    scheme, host, path = match.group(1), match.group(2).lower(), match.group(3) or ""
    local = host.split(":")[0] in {"localhost", "127.0.0.1"}
    if scheme != "https" and not local:
        raise ValueError("https_required")
    if not path:
        path = "/app-api/v1"
    return f"{scheme}://{host}{path}"
