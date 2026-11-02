# 02.11.2026 – Gemeinsame Modellansicht und KI-Chat

Felix hat das automatische Öffnen des Gebäudemodells, einen eigenen KI-Reiter mit Gesprächsverlauf und zentral gespeicherte Ansichtsänderungen freigegeben.

Umgesetzt: serverseitiger IFC-Typindex, additive Tabellen für Modellansicht und private KI-Gespräche, atomare Änderungen mit Revisionsprüfung, Berechtigungsprüfung für Eigentümer/angenommene Mitglieder, Datenbrücken für Web/iOS. Das Original-IFC bleibt erhalten. 3D öffnet das letzte ausgewählte Modell automatisch; KI und Teamchat bleiben getrennt. KI-Modellvorschläge müssen vor gemeinsamer Speicherung ausdrücklich bestätigt werden.

Prüfung: 57 Backend-Tests einschließlich fremder Konten, widerrufener Mitgliedschaft, Schreibkonflikten, Originaldateierhalt und idempotenter Chat-Wiederholung; fünf JS-/Three.js-Tests; echte WebKit-Tests für Befehle und Speichern/Übernehmen späterer Serveränderungen; iOS-Simulator-Build und Web-Build/Lint. Zusätzliche sichtbare Prüfung abhängig vom entsperrten Mac; keine private IFC-Datei für Google-Tests verwendet.

Details und Schnittstellen: [Gemeinsames Modell und KI-Chat](../gemeinsames-modell-und-ki-chat.md). Bereitstellung ausschließlich nach GitHub-PR über `d21-deploy`; Datenbank und bestehendes Volume bleiben erhalten.
