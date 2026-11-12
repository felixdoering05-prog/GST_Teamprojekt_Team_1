# App-Serverstatus · Version 1.0.113

Unter Profil → Serverstatus zeigt die App die erreichbare Serververbindung, die KI-Freigabe des angemeldeten Kontos, serverseitige Funktionsschalter und eigene Nutzung der letzten 24 Stunden. Ausnahmen für Gesprächslimits werden als „kein Kontolimit“ dargestellt. Projekt- und Anbieterlimits gelten unabhängig davon.

Die Übersicht zeigt außerdem eigene wartende, laufende und prüfbereite Planaufträge sowie in den letzten 24 Stunden fehlgeschlagene Aufträge. Manuelles Aktualisieren und Herunterziehen laden den Status neu. Fehler entfernen die vorherige Erfolgsmeldung.

`GET /api/v1/profile/service-status` benötigt eine gültige Kontositzung, liefert `Cache-Control: private, no-store` und enthält weder Zugangsdaten noch fremde Nutzungsdaten. Es werden keine externen Anbieter aufgerufen: „serverseitig aktiviert“ bedeutet keine bestätigte Anbieter- oder Worker-Erreichbarkeit. Bei älteren Serverständen zeigt die App eine Fehlermeldung; das Backend muss zusammen mit der App bereitgestellt werden.

Validierung: gezielte Backendtests für Anmeldung, Trennung der Konten, 24-Stunden-Fenster und Limit-Ausnahmen; iOS-Simulator-Build. Keine TestFlight-Veröffentlichung oder Geräteinstallation durch diese Änderung.
