# iPhone-Dashboard, lokale Demo und Messwert-Kontext für Gemini

03.11.2026 · Felix beauftragt, Web-Funktionen in die native App zu übernehmen, eine Demo mit Dashboards anzubieten und Daten für die KI-Analyse einzubinden.

Umgesetzt: eigener Dashboard-Reiter mit Gebäude-/Quellenauswahl, Sensorverläufen, Energiezeiträumen und regelbasierter Auswertung. Lokale, ausdrücklich fiktive Demo ohne Konto, Serveränderung oder Gemini-Aufruf. Geführter CSV-Import mit Sensoranlage und Vorschau. Dieselben Messdatensätze wie im Web; angenommene Mitglieder arbeiten im Gebäudebestand des Eigentümers.

Gemini erhält auf gesonderte Freigabe einen begrenzten, sichtbaren Messwert-Kontext. Kein Fine-Tuning/Modelltraining, keine PDF-/IFC-Interpretation und keine automatische Gerätesteuerung. Normale Gebäudechats erhalten keine zusätzliche Messwertübertragung. [Umfang, API und Grenzen](../iphone-dashboard-daten-ki.md).

Validierung vor Veröffentlichung: 76 Backendtests erfolgreich, native Foundation-Prüfungen für CSV, Zeitangaben, Grenzen und Demo sowie Debug-/Release-Build erfolgreich. Sichtbare Bedienungsprüfung offen, da Simulatorfenster nicht erreichbar und Felix aktuell nicht verfügbar. Keine echte Team-Messreihe für externe Testanfragen freigegeben.
