# Gemeinsame Modellansicht und privater Gebäude-KI-Chat

Stand: 02.11.2026. Von Felix freigegebener Umbau. Die IFC-Datei bleibt unverändert; Ansichtsänderungen liegen zentral in PostgreSQL. Rendering bleibt auf iPhone/Browser.

## Bedienung

Im Gebäude gibt es **Übersicht · Dateien · 3D · KI · Team**:

- **3D** lädt das zuletzt auf diesem Gerät ausgewählte Modell des Gebäudes automatisch, andernfalls das zuletzt hochgeladene IFC. Bei mehreren Modellen dient das Menü oben zum Wechseln. Das Modell muss einmal pro Öffnen heruntergeladen und lokal dargestellt werden; es gibt noch keinen vorab berechneten Geometrie-Cache auf dem Server.
- Bauteile antippen und einfärben/ausblenden. Farben, ausgeblendete IFC-IDs und simuliertes Raumlicht werden pro Dokument auf dem Projektserver gespeichert. Website und App laden denselben Stand; offene sichtbare Viewer fragen alle fünf Sekunden nach Änderungen. Kameraposition und Auswahl bleiben lokal. Raumlicht bleibt eine Simulation, keine Hardwaresteuerung.
- **KI** ist ein eigener Reiter mit privatem, konto- und gebäudebezogenem Gesprächsverlauf. **Team** bleibt der gemeinsame Chat mit anderen Menschen. Verlauf: bis zu 100 Frage-Antwort-Paare; keine automatische Übernahme alter Einzelfragen.
- Im KI-Reiter ein IFC-Modell auswählen. Im Modus **Frage** kennt die KI die serverseitig gezählten IFC-Typen (z. B. Wände, Türen, Fenster, Räume). Das sind IFC-Einträge, keine geometrisch geprüften realen Bauteile. Keine PDF-/Fotoanalyse, Raumzuordnung oder Planprüfung.
- Im Modus **Modellbefehl** beispielsweise „Färbe alle Wände blau“ senden. **Änderung prüfen** zeigt eine vom Server ermittelte Aktion und Trefferzahl; erst **Für das Gebäudeteam speichern** ändert die Ansicht. Wechsel nach 3D zeigt den gespeicherten Stand. Einzelne ausgewählte Bauteile weiterhin direkt im Viewer bearbeiten.
- Ein Schreibkonflikt liefert 409 statt fremde Änderungen zu überschreiben. Viewer zeigt „Nicht synchronisiert“ und bietet erneutes Laden. Nicht bestätigte lokale Änderungen werden dabei durch den Serverstand ersetzt. Ohne Verbindung wird kein erfolgreiches Speichern behauptet.

## Datenschutz / Gemini

Expliziter Übertragungsschalter vor Senden. Der Server-Schlüssel bleibt geheim. Frage-Modus sendet Gebäudename/Adresse, höchstens 20 Dateimetadaten, optional ausgewählten Modellnamen und IFC-Typzahlen sowie höchstens sechs vorherige Frage-Antwort-Paare dieses privaten KI-Chats. Keine IFC-Datei, Geometrie, PDF-Inhalte, Fotos, Teamnachrichten oder Kontakte. Befehlsmodus sendet nur Befehlstext und feste erlaubte Aktions-/Zieltypen, keinen Verlauf oder Modellindex. Bestehende Kontingente und sichere Wiederholung mit derselben Anfrage-ID bleiben erhalten.

Der private KI-Verlauf liegt in `app_ai_conversations`, getrennt vom kurzlebigen Kontingent-/Antwortcache. Mitglieder können nicht die KI-Gespräche anderer Mitglieder lesen. Gebäudelöschung/Kontolöschung entfernt zugehörige Verläufe über Fremdschlüssel; Dokumentlöschung entfernt dessen Ansicht. Zugriff wird bei jeder Anfrage und vor Speicherung erneut geprüft.

## Schnittstellenvertrag für Benjamin / Emir

Alle Routen unter `/api/v1`, bestehende Sitzung und Gebäudemitgliedschaft erforderlich. Keine neue externe Freigabe.

- `GET /documents/:id/model-index`: `{document_id, counts, limitations}`. Index wird aus dem serverseitigen IFC gelesen; keine vom Client behaupteten Typen. STEP-Zeichenketten und Kommentare zählen nicht als Entitäten.
- `GET /documents/:id/model-state`: `{revision, state:{hidden:[IFC-ID],colors:{"IFC-ID":"#rrggbb"},lights:[IFCSPACE-ID]}}`.
- `POST /documents/:id/model-state`: `{revision, operation:{action,ids,color?,on?}}`. Aktionen `hide`, `show`, `color`, `reset-colors`, `reset`, `light`. Revision muss aktuell sein. IDs müssen zur gespeicherten Datei gehören, Licht nur IFCSPACE. Maximal 10000 IDs je Änderung / Zustandssammlung. Reine Daten, kein Code.
- `POST /documents/:id/model-command`: `{command:{action,target,color,summary},confirm:false}` liefert `{count,description}` ohne Änderung. Mit `confirm:true,revision` speichert der Server erlaubte Befehle. Die Beschreibung wird aus validierten Feldern erzeugt; KI-Zusammenfassung wird nicht als Ausführungsanweisung vertraut.
- `GET /buildings/:id/assistant/history`: eigene letzte 100 Paare mit optionalem Vorschlag und Dokumentbezug.
- Bestehendes `GET /buildings/:id/assistant?document_id=:id` enthält optional `context.model.counts`; `?mode=ifc-command` bleibt statisch.
- Bestehendes `POST /buildings/:id/assistant` mit `chat:true,document_id?:Int` legt erfolgreiche Paare idempotent ab. UUID `X-Request-ID`, `consent:"yes"`, aktueller `context_hash`; Befehlsmodus zusätzlich `mode:"ifc-command"`.

Neue Tabellen werden additiv initialisiert: `app_model_views`, `app_ai_conversations`. Keine bestehenden Daten oder Container werden gelöscht. Die WebKit-/Iframe-Brücke reicht ausschließlich Datenoperationen durch; Sitzungs- und Website-Zugangsdaten gelangen nicht in den Viewer. Lokale Dateien ohne Upload behalten rein lokale Ansichtsänderungen. Web-Viewer nutzt ebenfalls gemeinsame Modellansichten, hat aber weiterhin nur die lokalen Beispielbefehle und noch keinen neuen KI-Chat.

## Grenzen

Keine Änderung an IFC-Geometrie oder Revit, keine automatischen Fachentscheidungen. Kein serverseitiges 3D-Rendering, keine neue Modellversion bei Farbänderungen. Ein neu hochgeladenes IFC ist ein neues Dokument mit eigenem Ansichtsstand; keine automatische Übertragung von Express-IDs zwischen Exporten. Kamera-/Auswahlzustand nicht geteilt. KI kann Absichten falsch verstehen: Vorschläge prüfen. KI-Befehle unterstützen noch keine Geschosse, benannte Einzelräume oder Lichtbefehle; manuelle Lichtsimulation wird geteilt, wenn IFCSPACE-Geometrie existiert.
