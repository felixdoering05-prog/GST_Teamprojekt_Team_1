# Teamtermin · 10. November 2026 · Glaskastensitzung (D21-Teamprojekt App)

[← Protokollverzeichnis](README.md)

> **Status: Entwurf – Gegenprüfung und Freigabe ausstehend.** Nach der mündlichen Sitzung am 10.11.2026 in ChatGPT festgehalten. Aussagen zum Implementierungsstand sind **Sitzungsberichte**, keine unabhängigen Tests oder Repository-Nachweise. Dieses Protokoll wurde noch nicht von den anderen Teilnehmenden bestätigt.

| Angabe | Eintrag |
| :--- | :--- |
| Datum | Dienstag, 10.11.2026 |
| Beginn / Ende / Zeitzone | Gesprächsbeginn ca. 13:31 Uhr MEZ; Sitzungsende nicht erfasst |
| Ort / Format | „Glaskasten“, Teamsitzung in Präsenz |
| Teilnehmende | Josef, Lukas, Vincent, Felix und Emir |
| Nicht anwesend, aber mit Aufgaben genannt | Benjamin (Anwesenheit in der Sitzung nicht genannt) |
| Moderation | Nicht eindeutig erfasst |
| Protokollführung | Emir mit ChatGPT-Unterstützung |
| Gegenprüfung durch / am | Offen |
| Status | Entwurf, Review ausstehend |
| Nächster Meilenstein | Heatmap-/D21-Präsentation am 23.11.2026 |

## Ziel und Tagesordnung

1. Hochschulserver und KI-Anbindung
2. Weiterentwicklung der Web-App, IFC-/BIM-Viewer, Heatmap und Campusstruktur
3. Sensordaten, Live-Anbindung und Simulationsversuche
4. iOS-App, TestFlight und BIMcraft
5. Präsentation und nächste Schritte

## Ergebnisse und Diskussionsstand

### 1. Hochschulserver und KI

Josef klärt nach Eingang der angekündigten E-Mail mit dem Professor, **ab wann und wie** die App auf den Hochschulserver umziehen kann. Dazu sollen die technischen Serveranforderungen erfragt bzw. weitergegeben werden. Zudem soll Josef bei der h_da bzw. dem Professor prüfen, ob Hochschul-KI-Modelle über eine API erreichbar sind oder ob alternativ ein lokal betriebenes Modell (z. B. Ollama) möglich wäre. Erforderliche Serverressourcen und Leistungsgrenzen sind zu ermitteln.

**Status:** Angefragt bzw. zur Klärung vorgesehen; keine zugesagten Serverkapazitäten oder API-Zugriffe belegt.

### 2. Web-App, IFC-Viewer, Heatmap und Projektstruktur

Emir entwickelt die Web-App weiter. Besprochen wurden:
- **Teilen und Zusammenarbeit:** Mehrere Nutzer sollen einem Gebäude bzw. einem übergeordneten Projekt zugeordnet werden können. Die im Team erwähnte Umsetzung für die Handy-App in GitHub ist auf Eignung zur Übernahme zu prüfen.
- **IFC-/BIM-Viewer:** Darstellung und Bedienung verbessern. Emir berichtete, bereits Änderungen am IFC-Viewer durchgeführt zu haben.
- **Heatmap:** Bereits begonnene Überarbeitung fortsetzen; zusätzlich Heatmaps je Geschossplan mit deutlich lesbaren Farbabstufungen, Farbvarianten und verständlicher Legende für die Präsentation erarbeiten.
- **Layout:** Emir berichtete über ein verändertes Web-Layout, das später eingespielt und gemeinsam betrachtet werden soll. Eine produktive Bereitstellung wurde nicht bestätigt.
- **Campusstruktur:** Eine hierarchische Ansicht **Campus → Gebäude** wird vorgeschlagen, damit zukünftig beispielsweise der h_da-Campus sowie ggf. Pittsburgh mit mehreren Gebäuden abgebildet werden können. Konkrete Datenmodelländerungen wurden nicht beschlossen.
- **Gebäudemodell:** Die andere Projektgruppe soll das Intercampus-/Campus-Modell voraussichtlich **Ende November bis Anfang Dezember** liefern. Ein konkreter Liefertermin wurde nicht zugesagt.
- **BIMcraft:** Laut Sitzungsbericht läuft auf dem Server ein Revit-ähnliches System „BIMcraft“, das derzeit mit Gemini verbunden sei. Emir soll den tatsächlichen Bestand ermitteln und eine Web-App-Integration prüfen.

**Status:** Mehrere Überarbeitungen mündlich berichtet, aber beim Termin weder produktiver Einbau noch Ende-zu-Ende-Funktionstest nachgewiesen.

### 3. Sensorik und Datenpfad

Benjamin soll an vorhandenen Schnittstellen/Programmcode der Web-App ansetzen und versuchen, einen eigenen Sensor bzw. seine Wetterstation anzubinden. Eine E-Mail an den Professor zu Sensoroptionen wurde als bereits versendet berichtet. Es wurden Preise betrachtet: **Temperatur und relative Luftfeuchte** sind vorerst vorgesehen, während **CO₂** wegen höherer Kosten zunächst nachrangig ist.

Als zusätzliche Tests wurden ein **ESP32** oder **Raspberry Pi** besprochen. Auch ein simulierter Messwert ohne physischen Sensor wäre zum reinen Schnittstellentest möglich. Ein Teammitglied erwähnte einen vorhandenen Raspberry Pi; die verbindliche Zuständigkeit für diesen ergänzenden Test wurde nicht eindeutig zugeteilt. Bis zum Folgetreffen am 17.11. soll möglichst ein erster Versuch erfolgen.

Für die Präsentation am 23.11. wäre ein vorführbarer **echter Live-Sensor** wünschenswert; die Realisierbarkeit ist noch mit Benjamin abzustimmen.

**Wichtig:** **Echte Messung**, **simulierte Sensorwerte** und **nicht nachgewiesener Live-Zugriff** müssen in Demo und Dokumentation getrennt gekennzeichnet werden. Eine funktionierende Live-Anbindung wurde im Termin nicht nachgewiesen.

### 4. iOS-App und TestFlight

Felix führt die Entwicklung der Handy-/iOS-App fort. Ein **TestFlight-Link** soll bereitgestellt werden, damit Teammitglieder die App auf ihren Geräten installieren und testen können.

**Status:** Verfügbarkeit und Installation des aktuellen TestFlight-Builds im Termin nicht belegt.

### 5. Präsentation

Vincent übernimmt die Präsentationsfolien und den organisatorischen Aufbau. Emir liefert das **technische Know-how** zur Web-App und Heatmap. Vincent und Emir wollen sich zur gemeinsamen inhaltlichen Vorbereitung zusammensetzen und den Vortrag vorab üben.

**Termin:** **Montag, 23. November 2026, 14:00 Uhr**, **Green Office, Gebäude C10**. Vorführung des aktuellen Programmstands und der Heatmap; Live-Sensordaten nach Möglichkeit, aber nicht zugesagt.

## Absprachen und Entscheidungen

| Thema | In der Sitzung besprochene Festlegung | Einschränkung |
| :--- | :--- | :--- |
| Web-App | Emir arbeitet an Web-App, IFC-Viewer, Heatmap und Mehrnutzer-/Projektfreigabe | Umsetzung noch zu prüfen |
| Server/KI | Josef übernimmt die Abstimmung mit Professor und h_da | Umzug, API oder Ollama nicht entschieden |
| Sensorik | Benjamin soll einen ersten Datenpfad testen, Schwerpunkt Temperatur/Feuchte | Live-Sensor zum Präsentationstermin noch offen |
| Präsentation | Vincent bereitet Folien vor, Emir die technischen Inhalte; gemeinsames Üben | Probetermin noch nicht vereinbart |
| iOS | Felix entwickelt die App weiter und klärt TestFlight-Zugang | TestFlight nicht verifiziert |
| Campus | Campus→Gebäude als Konzept weiterverfolgen | Noch kein abschließender Architekturentscheid |
| Pittsburgh | Als zukünftige Option genannt | Details fehlen |

## Folgeaufgaben

| Bezug | Konkretes Ergebnis / nächster Schritt | Verantwortlich | Termin / Ziel | Prüfkriterium |
| :--- | :--- | :--- | :--- | :--- |
| [#101](../../issues/101) | Professor und h_da zu Serverumzug, Ressourcen und KI-API/Ollama befragen | Josef | Status 17.11. | Rückmeldung mit Anforderungen und Optionen |
| Web-App / IFC | Änderungen an Viewer und neuem Layout nachvollziehbar testen | Emir | Status 17.11.; Demo 23.11. | Browser-Test und Screenshot |
| Heatmap | Darstellung je Geschossplan, Farbskala und Legende verbessern | Emir | Vor 23.11. | Vorführbare Heatmap mit gekennzeichneter Datenquelle |
| Mehrnutzer | Prüfen, wie Benutzer einem Projekt/Gebäude zugeordnet und Freigaben umgesetzt werden | Emir | Status 17.11. | Beschriebener Ablauf und prüfbarer Test |
| Campus | Campus→Gebäude-Struktur und HDA/Pittsburgh als mögliche Datengruppen skizzieren | Emir | Status 17.11. | UI-Konzept ohne Verlust bestehender Gebäude |
| BIMcraft | Vorhandene Server-Komponenten, Gemini-Anbindung und Integrationsweg recherchieren | Emir | Status 17.11. | Konkrete Schnittstellen und Zugriffsgrenzen |
| [#102](../../issues/102), [#74](../../issues/74) | Eigenen Sensor/Wetterstation bzw. Messwert in D21-Anbindung erproben | Benjamin | Möglichst vor 23.11. | Quelle, Einheit, Zeitstempel und Anzeige dokumentiert |
| Zusatzversuch | ESP32/Raspberry Pi oder PC-Simulation zum Schnittstellentest aufsetzen | Zuständigkeit offen | Möglichst bis 17.11. | Test mit ausdrücklich als simuliert markiertem Wert |
| iOS | Entwicklungsstand und verfügbaren TestFlight-Link teilen | Felix | Status 17.11. | Installation/Start testbar |
| Vortrag | Folien erstellen, Fachinhalte abstimmen, gemeinsam üben | Vincent und Emir | Vor 23.11. | Präsentationsentwurf und Probelauf |

## Risiken und offene Fragen

- Hochschulserver: Ressourcen, Freigaben, Umzugszeitpunkt, Betrieb von KI-Modellen und API-Rechte ungeklärt.
- Sensorik: Kosten und Hardwareverfügbarkeit; noch kein belegter Ende-zu-Ende-Live-Datenpfad.
- Raspberry Pi/ESP32: Wer den ergänzenden Test verbindlich übernimmt, bleibt offen.
- Web-App: Bestehende mobile Freigabelogik könnte nicht ohne Weiteres übertragbar sein.
- Modelle: Lieferung und Umfang des angekündigten Campus-/IFC-Modells unbestätigt.
- Pittsburgh: Konkrete Daten und Anforderungen noch unbekannt.
- BIMcraft/Gemini: Integrationsfähigkeit, Zugang und produktiver Status nicht getestet.
- Präsentation: Technische Vorführbarkeit vor dem 23.11. prüfen, Simulation klar von Live-Daten abgrenzen.

## Nächste Termine

- **Dienstag, 17.11.2026:** Nächste Teambesprechung **nach Projektmanagement**; genaue Uhrzeit nicht genannt.
- **Montag, 23.11.2026, 14:00 Uhr:** Projekt- und Heatmap-Präsentation im **Green Office, Gebäude C10**.

## Freigabe und Nachträge

- **Gegenprüfung/Freigabe:** Offen. Dieses Dokument ist ein **Sitzungsentwurf**; ein teilnehmendes Teammitglied sollte Inhalt und Aufgaben gegenlesen.
- **Nachträge:** Keine (Stand der Ersterfassung am 10.11.2026).
