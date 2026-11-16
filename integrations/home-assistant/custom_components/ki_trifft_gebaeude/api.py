"""Kleiner HTTP-Client für die Brücken-Endpunkte des Projektservers."""
from __future__ import annotations

from typing import Any

import aiohttp

from .const import USER_AGENT


class BridgeError(Exception):
    """Fehler mit HTTP-Status (0 = nicht erreichbar)."""

    def __init__(self, status: int, message: str = "") -> None:
        super().__init__(message or f"HTTP {status}")
        self.status = status


class BridgeClient:
    def __init__(self, session: aiohttp.ClientSession, server: str, token: str | None = None) -> None:
        self._session = session
        self._server = server.rstrip("/")
        self._token = token

    async def _call(self, method: str, path: str, body: dict | None = None) -> Any:
        headers = {"User-Agent": USER_AGENT, "Content-Type": "application/json"}
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        try:
            async with self._session.request(
                method, f"{self._server}/ha-bridge/{path}", json=body, headers=headers,
                timeout=aiohttp.ClientTimeout(total=20), allow_redirects=False,
            ) as response:
                data = await response.json(content_type=None) if response.content_length != 0 else {}
                if response.status >= 400:
                    raise BridgeError(response.status, (data or {}).get("error", ""))
                return data
        except (aiohttp.ClientError, TimeoutError) as err:
            raise BridgeError(0, str(err)) from err

    async def pair(self, code: str, instance_name: str, ha_version: str) -> dict:
        return await self._call("POST", "pair", {"code": code, "instance_name": instance_name, "ha_version": ha_version})

    async def inventory(self, payload: dict) -> dict:
        return await self._call("POST", "inventory", payload)

    async def states(self, states: list[dict]) -> dict:
        return await self._call("POST", "states", {"states": states})

    async def history(self, points: list[dict]) -> dict:
        return await self._call("POST", "history", {"points": points})

    async def unlink(self) -> None:
        await self._call("DELETE", "link")
