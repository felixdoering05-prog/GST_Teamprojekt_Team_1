# Gemeinsame IFC-Fakten für Text und Sprache

Text- und Sprachassistent nutzen eine gemeinsame numerische Modellübersicht: Räume, Geschosse, Türen und Fenster, Analysezeitpunkt und Strukturhinweise. Höchstens drei Modelle; weitere vorhandene Modelle werden ausdrücklich gekennzeichnet. Zahlen werden niemals über Modellversionen summiert.

Eine ausstehende oder fehlgeschlagene Analyse liefert unbekannte Werte (`null`), keine erfundenen Nullen. In einem vorhandenen vollständigen Typzähler bedeutet ein fehlender Typ dagegen null Vorkommen. IfcSpace ist ein IFC-Raumeintrag, nicht zwingend ein nutzbares Zimmer. Die Modellübersicht bleibt ein Schnappschuss beim Gesprächsstart; neue Uploads benötigen ein neues Sprachgespräch.

Raumlisten und freie Berichtstexte werden nicht an externe KI-Dienste weitergereicht. Die bestehende Übertragung von Gebäudestammdaten, Dateinamen und freigegebenen Lampen bleibt davon unberührt. Der Textchat nutzt bei vorhandener Analyse die gespeicherten Typzahlen, statt bei jedem Kontextabruf die gesamte IFC-Datei erneut zu laden und zu zählen. Ohne explizite Auswahl stehen ebenfalls numerische Modellübersichten zur Verfügung.

Prüfung: vollständiger Backendtestlauf (154 Tests) plus zusätzlicher Textrouten-Integrationstest erfolgreich. Tests unterscheiden unbekannt/0, prüfen Ausschnittgrenzen, Gebäude-/Dokumentfilter und ausgeschlossene Raumnamen. Kein App-Update erforderlich.
