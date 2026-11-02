# Kontakte, Gebäudefreigaben, Mitteilungen und Chat

02.11.2026 · Technisches Entwicklungsprotokoll, kein Sitzungsprotokoll.

Felix hat Kontakte über E-Mail mit ausdrücklicher Annahme, gleiche Bearbeitungsrechte im geteilten Gebäude, In-App-Mitteilungen und einen kleinen Gebäude-Chat beauftragt. Oberfläche ruhig und an Apple angelehnt; noch keine Apple-Developer-Mitgliedschaft, daher keine Push-Einrichtung.

Die Umsetzung ergänzt die bestehende Konten-API additiv und vereinfacht die iOS-Navigation auf drei Hauptbereiche. Der Eigentümer verwaltet Freigaben; angenommene Mitglieder teilen Stammdaten, Dateien/IFC und Chat. Die API erzwingt die Rechte bei jeder Anfrage. Kontakte zeigen zunächst Vornamen und Initialen, keine fremden privaten Profilbilder. Chatnachrichten und ihre Mitteilungen werden gemeinsam transaktional gespeichert.

Validierung: 41 Backendtests bestanden, Simulator-Build erfolgreich. Lokale Debug-Vorschau von Kontakten, Mitteilungen und Navigation zum Gebäude-Chat sichtbar geprüft. Keine echten Kontakte oder Nachrichten im Namen von Felix versandt. Zwei-Geräte-Test mit persönlichen Konten bleibt erforderlich. [Bedienung, API-Vertrag für Benjamin/Emir und Grenzen](../zusammenarbeit-app.md).

Das bestehende lokale Xcode-Projekt wurde vor Übernahme verglichen. In ContentView.swift fand sich als einzige Abweichung zum GitHub-Ausgangsstand ein versehentliches `ma` vor einer schließenden Klammer; die Übernahme korrigiert diesen Syntaxfehler. Private Xcode-Signierung bleibt erhalten.
