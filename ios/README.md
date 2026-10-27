# D21 · iOS-Prototyp

In Xcode `KI Trifft Gebäude APP/KI Trifft Gebäude APP.xcodeproj` öffnen, das gleichnamige Scheme und einen iPhone-Simulator wählen und starten.

Enthalten: Gebäudeübersicht, Anlegen und Details, Suche nach Name/Adresse sowie lokale Speicherung der Gebäude über App-Neustarts hinweg. Die vorhandenen Tabs Meldungen und Profil bleiben als Platzhalter erhalten. Die erste Installation startet mit einem als Beispiel gekennzeichneten D21-Datensatz.

Die Daten bleiben ausschließlich auf dem Gerät. Es gibt noch keine Server-Synchronisierung, Anmeldung oder Dateiuploads. Löschen der App entfernt auch die lokalen Daten. Vor einer Anbindung die API mit Benjamin abstimmen. Es werden keine Zugangsdaten mitgeliefert.

Validierung: Debug-Build für den iPhone-18-Pro-Simulator erfolgreich mit Xcode 27.1. Ausgangspunkt ist Felix’ vorhandenes SwiftUI-Projekt; Quellcode und Projektdatei sind hier gemeinsam versioniert.
