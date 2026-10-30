# Web-BIM-Viewer mit gemeinsamer iPhone-Datenbasis

Datum: 30. Oktober 2026

Auf Felix' Wunsch erhält die bestehende Website einen IFC-3D-Viewer. Dieser nutzt dieselben Konten, Gebäude und IFC-Dokumente wie die iPhone-App. Der bisherige schematische Grundriss bleibt als separate Ansicht erhalten. In der Dateiverwaltung führt „In 3D öffnen“ direkt zum Modell.

Umsetzung ausschließlich im Web-Frontend, keine API- oder Datenbankschemaänderungen. Farben, Sichtbarkeit und Lichtsimulation bleiben je geöffneter Ansicht lokal. Weitere Details und Prüfungen: [Web-BIM-Viewer](../web-bim-viewer.md).

Veröffentlichung über eigenen Branch und Pull Request; Produktivbetrieb ausschließlich über `d21-deploy`. Bestehende Datenbank und Volumes bleiben erhalten.
