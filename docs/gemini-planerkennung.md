# Gemini-Planerkennung: erster Verbesserungsschritt

Gemini erhält ein verbindliches JSON-Ausgabeschema für Geschosse, Maßbelege, Außenkontur, Wände, Öffnungen und Raumpunkte. Das lokale Geometrie-Prüfverfahren bleibt verbindlich: Schema-Konformität belegt keine geometrische oder fachliche Richtigkeit.

Der Prompt priorisiert Planart, Duplikate/Ausschnitte, abgelesene Maße/Einheiten und Geschosszuordnung vor der Modellierung. Fehlende Maße dürfen nicht durch Formatbeispiele oder Papiergrößen ersetzt werden.

Bei `needs_input` wird die begrenzte, als unzuverlässiger Text behandelte konkrete Begründung des Anbieters in den Auftragshinweisen angezeigt. Sie wird nicht als Befehl ausgeführt. Bestehende App-Versionen zeigen diese Hinweise bereits an. Keine zusätzlichen automatischen Wiederholungen oder zweiten KI-Aufrufe; keine Modellumstellung.

Validiert mit 151 Backendtests und einer synthetischen Live-Anfrage ohne Plandaten: konfiguriertes Gemini-Modell akzeptiert Schema (HTTP 200) und antwortet korrekt mit `needs_input`. Dies ist kein Nachweis höherer Erkennungsgenauigkeit an echten Plänen. Die drei gespeicherten `provider_rejected`-Aufträge sind dadurch nicht rückwirkend diagnostiziert.

Nächster Schritt: Planüberlagerung mit bearbeitbarem Maßstab und Geschosszuordnung sowie ein kleiner, freigegebener Referenzplansatz zur Messung von Wand-/Raum-/Öffnungsfehlern. Diese Oberfläche und Rückübermittlung der Antworten sind noch nicht Bestandteil dieser Änderung.

Quelle: https://ai.google.dev/gemini-api/docs/structured-output?lang=rest
