# 03.11.2026 – h_da-API vorbereitet, Server-VPN noch offen

Felix hat die Hochschul-Anleitung bereitgestellt und den API-Key selbst geschützt auf dem Server abgelegt. Der ersetzte Schlüssel authentifiziert erfolgreich. Über den VPN-verbundenen Mac wurden die angebotenen Modelle abgefragt und `qwen3-30b-a3b-instruct-2507` mit neutralem Text sowie drei erlaubten Modellvorschlägen erfolgreich getestet. Keine privaten Baupläne oder Gebäudeinformationen an den Anbieter übertragen.

Anbieter-Adapter für Open WebUI, dynamische Anbieteranzeige und ausdrückliche Anbieterzustimmung in der App ergänzt. Chatverläufe, Rechteprüfung, Kontingente und Vorschau/Bestätigung bleiben erhalten. Keine automatische Ausweichübertragung an Google. Die Hochschule meldete ein Limit von zwei Anfragen je zehn Sekunden; der beobachtete HTTP-400-Limitfehler wird auf 429 abgebildet.

Prüfungen: Backend-Suite einschließlich HDA-Adapter, Anmeldung, Zustimmung, Chat-Replay, sicherem JSON und Rate-Limit; bestehende JS-/Three.js-Tests; echter WKWebView-Test für Modellbefehle; iOS-Simulator-Build und Web-Build/Lint. Schlüsselwerte sind kein Bestandteil des Codes oder Protokolls.

**Offen:** Der Server erreicht die nur hochschulöffentlich erreichbare API nicht. Felix hat eine dauerhafte VPN-/Hochschulfreigabe gewählt, keinen Mac-Relay-Betrieb. OpenVPN ist vorhanden, ein eigener Serverzugang fehlt. Die h_da-API wird deshalb noch nicht als produktiv angebunden beschrieben oder blind aktiviert.

[Schnittstellen, Einrichtung und Betriebsgrenzen](../hda-openwebui-anbindung.md)
