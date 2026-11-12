# Geführter Gebäudeentwurf – 12. November 2026

App-Kandidat 1.0.101 (101). Noch kein neuer TestFlight-Upload.

## Ablauf

1. Gebäudename und Adresse erfassen; Zwischenstand bleibt lokal wiederherstellbar.
2. Außenfotos hochladen; diese sind nicht automatisch als Grundrisse ausgewählt.
3. Zusammengehörige, gut lesbare und bemaßte Grundrisse hochladen (PDF oder Bild). Bestehende IFC-Modelle bleiben direkt nutzbar; DWG wird gespeichert, aber nicht durch die Planerkennung verarbeitet.
4. Im letzten Schritt bis zu vier Pläne mit zusammen maximal 10 MB wählen und einmal bewusst freigeben. Die Erklärung nennt die vollständige Übertragung an Gemini, Konto-KI und die dauerhafte Plananalyse-Einstellung dieses Gebäudes. Die Freigabe schaltet keine bislang ausgeschaltete Lampensteuerung ein.
5. Ein persistenter Auftrag verarbeitet die Pläne auf dem Server: Gemini erkennt Geometrie, BIMCraft erstellt einen vorläufigen IFC-Entwurf. Stabile Auftragskennung verhindert doppelte Aufträge nach unklarer Netzwerkantwort. Vorhandene Quoten und Eigentümerprüfungen bleiben bestehen.
6. Der Eigentümer erhält bei erfolgreicher Generierung eine serverseitig gespeicherte Mitteilung. Von dort direkt zur Vorschau; der Entwurf muss bewusst geprüft und übernommen werden. Originalpläne und vorhandene Modelle werden nicht ersetzt.

## Benachrichtigungen und offene Freigabe

Die Fertigmeldung wird in derselben Datenbanktransaktion wie das fertige Modell gespeichert. Sie wird nur bei tatsächlichem Übergang zu `ready` erzeugt, nicht nach Abbruch oder bei erneutem Worker-Poll. Andere Gebäudemitglieder erhalten keine privaten KI-Ergebnisse.

**Noch kein APNs-Push bei geschlossener App.** Felix hat bestätigt, dass die Hochschule den Apple-Push-Schlüssel erst freigeben muss. Dafür werden ein APNs-Schlüssel mit Team-/Key-ID, die Push-Capability des App-Identifier und anschließend die abgesicherte Geräteregistrierung samt Versand/Abmeldung benötigt. Schlüssel niemals ins Repository oder in den Chat kopieren. Aktuell erscheint die Meldung beim Öffnen/Aktualisieren der App; das wird im Ablauf ausdrücklich so erklärt.

## Betrieb und Hochschulmigration

Verarbeitung bleibt im bestehenden separaten `plan-worker`, Dateien und Auftragszustand in PostgreSQL. Kein laufendes iPhone und kein Gaming-PC nötig. Für den Umzug auf Hochschulserver gilt weiterhin [Plan-zu-IFC-Betriebsanleitung](../plan-zu-ifc.md). Modellgenerierung ist experimentell und ersetzt keine geprüfte Fachplanung.

## Validierung

Backend-Suite; zusätzliche Assertions für genau eine Fertigmeldung an den Eigentümer, keine Fertigmeldung nach Widerruf und keine Duplikate beim erneuten Poll. Native Workflow-Prüfung für lokal gespeicherte Auftragskennung und Plan-IDs, bestehende Konto-/Serverisolation und Upload-Wiederaufnahme. Simulator-Build. Kein realer Plan an Google gesendet, kein privates Gebäude geändert.
