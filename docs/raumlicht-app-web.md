# Raumlicht in iPhone und Web · 1.0.154

Der bestätigte Lampenzustand färbt den zugeordneten IFC-Raum in beiden Modellviewern ein.
Farbe und Helligkeit werden identisch dargestellt; ohne RGB-Angabe gilt warmweiß.
Ausgeschaltete Lampen bzw. Helligkeit null erzeugen keinen Lichteffekt. Bei mehreren Lampen
bleibt der Raum an, solange mindestens eine erreichbare Lampe eingeschaltet ist.
Teilweise nicht erreichbare Geräte werden entsprechend gekennzeichnet.

## Zuordnung

- Explizite Modell-/Raumzuordnungen bleiben an das jeweilige Dokument gebunden.
- Gebäudebezogene Lampen ohne Dokumentzuordnung lassen sich über eindeutige
  IFC-Raumnummer, Langname oder die kombinierte Raumbeschriftung auflösen.
- Importierte Home-Assistant-Lampen verwenden vorrangig die GlobalId des zugeordneten
  Raums. Eine unbekannte GlobalId wird nicht durch einen geratenen Namen ersetzt.
- Doppelte Raumnamen auf verschiedenen Geschossen sind ohne zusätzliche Zuordnung
  mehrdeutig und werden nicht automatisch verbunden.
- Alle ausgewählten importierten Lampen bis zum vorhandenen Importmaximum von 500
  werden berücksichtigt; die frühere Abschneidung nach 50 Lampen entfällt.

Die Raumkarte im Web verwendet bei reinen Namenszuordnungen dieselben Eindeutigkeitsregeln.
Eine alte IFC-Express-ID ohne zugehöriges Dokument wird niemals auf ein anderes Modell übertragen.
Unverbundene/geplante Geräte werden weiterhin nicht als reale, geschaltete Lampen ausgegeben.
Simulation bleibt Simulation; der Darstellungsabgleich sendet selbst keine Schaltbefehle.

## Darstellung und Grenzen

Die gemeinsame Darstellung für Web und iPhone liegt in
`dashboard/base44-frontend/ifc-viewer/room-light.js`. Der Gerätestatus übersteuert die
manuelle Modell-Simulation; der bestehende Abgleich aktualisiert etwa alle fünf Sekunden.
Veraltete importierte Zustände bleiben als nicht erreichbar gekennzeichnet.

Für eine räumlich korrekte Darstellung benötigt das IFC ein tatsächlich darstellbares
IfcSpace-Volumen. Fehlt dieses, zeigt die Oberfläche „Ohne Raumgeometrie“;
es werden keine Raumpositionen oder Raumgrenzen erfunden. Die bestehenden Speichergrenzen
für große IFC-Dateien bleiben bestehen.

Prüfungen: 75 reale Testdatenbank-Räume einschließlich der Lampen hinter Position 50,
IFC-Namen/GlobalIds und Mehrdeutigkeit, verwaiste Modellbindungen, Farbe/Dimmung/Nullhelligkeit,
Teil-Erreichbarkeit, Ausschalten, gelöste Gerätezuordnung und Zustandsabgleich beider Viewer.
