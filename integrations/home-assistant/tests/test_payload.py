"""Tests für die reinen Paketfunktionen (ohne Home-Assistant-Installation)."""
import importlib.util
import json
import pathlib
import unittest
from datetime import datetime, timedelta, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1] / "custom_components" / "ki_trifft_gebaeude"
spec = importlib.util.spec_from_file_location("payload", ROOT / "payload.py")
payload = importlib.util.module_from_spec(spec)
spec.loader.exec_module(payload)

SENSORS = [
    {"entity_id": "sensor.wohnzimmer_temperatur", "name": "Temperatur", "device_class": "temperature", "unit": "°C", "device_id": "dev1", "area_id": None},
    {"entity_id": "sensor.buero_co2", "name": "CO₂\x00", "device_class": "carbon_dioxide", "unit": "ppm", "device_id": None, "area_id": "buero"},
    {"entity_id": "sensor.zaehler", "name": "Zähler", "device_class": "energy", "unit": "kWh", "device_id": "dev2", "area_id": "keller"},
    {"entity_id": "sensor.handy_standort", "name": "Handy", "device_class": None, "unit": None, "device_id": "phone", "area_id": None},
    {"entity_id": "sensor.batterie", "name": "Batterie", "device_class": "battery", "unit": "%", "device_id": "dev1", "area_id": None},
    {"entity_id": "person.felix", "name": "Felix", "device_class": "temperature", "unit": "°C", "device_id": None, "area_id": None},
    {"entity_id": "sensor.temp_milli", "name": "T", "device_class": "temperature", "unit": "mK", "device_id": None, "area_id": None},
]
DEVICES = {
    "dev1": {"name": "Klimasensor", "manufacturer": "Aqara", "model": "TH", "area_id": "wohnzimmer"},
    "dev2": {"name": "Stromzähler", "manufacturer": "", "model": "", "area_id": "wohnzimmer"},
    "phone": {"name": "Felix iPhone", "manufacturer": "Apple", "model": "iPhone", "area_id": "schlafzimmer"},
}
AREAS = {"wohnzimmer": "Wohnzimmer", "buero": "Büro", "keller": "Keller", "schlafzimmer": "Schlafzimmer"}


class InventoryTest(unittest.TestCase):
    def test_only_allowed_sensors_and_needed_areas_leave_home_assistant(self):
        inv = payload.build_inventory(SENSORS, DEVICES, AREAS)
        ids = [e["entity_id"] for e in inv["entities"]]
        self.assertEqual(ids, ["sensor.buero_co2", "sensor.wohnzimmer_temperatur", "sensor.zaehler"])
        self.assertNotIn("Felix iPhone", json.dumps(inv, ensure_ascii=False))
        self.assertNotIn("schlafzimmer", [a["area_id"] for a in inv["areas"]])
        self.assertEqual([d["device_id"] for d in inv["devices"]], ["dev1", "dev2"])
        by_id = {e["entity_id"]: e for e in inv["entities"]}
        self.assertEqual(by_id["sensor.wohnzimmer_temperatur"]["area_id"], "wohnzimmer", "device area is inherited")
        self.assertEqual(by_id["sensor.zaehler"]["area_id"], "keller", "entity area overrides device area")
        self.assertEqual(by_id["sensor.buero_co2"]["name"], "CO₂")

    def test_unknown_references_are_dropped(self):
        inv = payload.build_inventory([{**SENSORS[0], "device_id": "missing", "area_id": "nirgends"}], DEVICES, AREAS)
        self.assertIsNone(inv["entities"][0]["device_id"])
        self.assertIsNone(inv["entities"][0]["area_id"])
        self.assertEqual(inv["areas"], [])

    def test_caps_entity_count(self):
        many = [{"entity_id": f"sensor.t{i:04d}", "name": "T", "device_class": "temperature", "unit": "°C"} for i in range(600)]
        self.assertEqual(len(payload.build_inventory(many, {}, {})["entities"]), payload.MAX_ENTITIES)


class StatesTest(unittest.TestCase):
    def test_only_selected_numeric_changed_values(self):
        t = datetime(2026, 11, 16, 12, 0, 0, 123456, tzinfo=timezone.utc)
        states = [
            {"entity_id": "sensor.a", "state": "21.5", "last_updated": t},
            {"entity_id": "sensor.b", "state": "unavailable", "last_updated": t},
            {"entity_id": "sensor.c", "state": "5", "last_updated": t},
            {"entity_id": "sensor.d", "state": "nan", "last_updated": t},
        ]
        out = payload.build_states(states, {"sensor.a", "sensor.b", "sensor.d"}, {})
        self.assertEqual(out, [{"entity_id": "sensor.a", "value": 21.5, "measured_at": "2026-11-16T12:00:00.123+00:00"}])
        self.assertEqual(payload.build_states(states, {"sensor.a"}, {"sensor.a": out[0]["measured_at"]}), [])


class HistoryTest(unittest.TestCase):
    def test_hourly_statistics_are_chunked(self):
        start = datetime(2026, 11, 10, tzinfo=timezone.utc).timestamp()
        stats = {
            "sensor.a": [{"start": start + i * 3600, "mean": 20 + i % 3} for i in range(2500)],
            "sensor.e": [{"start": start, "mean": None, "state": 1234.5}],
            "sensor.x": [{"start": start, "mean": 1}],
        }
        chunks = payload.build_history(stats, {"sensor.a", "sensor.e"})
        self.assertEqual([len(c) for c in chunks], [2000, 501])
        self.assertEqual(chunks[-1][-1], {"entity_id": "sensor.e", "value": 1234.5, "measured_at": "2026-11-10T00:00:00.000+00:00"})
        self.assertFalse(any(p["entity_id"] == "sensor.x" for c in chunks for p in c))


class ServerTest(unittest.TestCase):
    def test_server_address(self):
        self.assertEqual(payload.normalize_server("https://Example.org/"), "https://example.org/app-api/v1")
        self.assertEqual(payload.normalize_server("https://example.org/api/v1/"), "https://example.org/api/v1")
        self.assertEqual(payload.normalize_server("http://localhost:3000/api/v1"), "http://localhost:3000/api/v1")
        for bad, reason in [("http://example.org", "https_required"), ("ftp://x", "invalid_url"), ("https://user@x.org", "invalid_url"), ("https://x.org/?a=1", "invalid_url")]:
            with self.assertRaises(ValueError) as ctx:
                payload.normalize_server(bad)
            self.assertEqual(str(ctx.exception), reason)

    def test_units_match_server(self):
        server = (ROOT.parents[3] / "dashboard" / "backend" / "src" / "ha-import.js").read_text(encoding="utf-8")
        for device_class, units in payload.ALLOWED_UNITS.items():
            self.assertIn(f"device_class:'{device_class}'", server)
            for unit in units:
                self.assertIn(f"'{unit}':", server)


if __name__ == "__main__":
    unittest.main()
