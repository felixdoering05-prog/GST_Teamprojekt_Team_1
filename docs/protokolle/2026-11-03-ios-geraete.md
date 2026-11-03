# Protokoll · Gerätebereich und einfachere iPhone-Abläufe

03.11.2026 · Auftrag Felix: Handy-App vereinfachen, Abläufe ergänzen und spätere Geräteintegration ähnlich einer Smart-Home-Verwaltung vorbereiten.

Umgesetzt: eigener Gerätereiter, gebäudebezogene Liste/Raumfilter, dreistufige Anlage, servergespeicherte Licht-/Steckdosensimulation und vorgemerkte Integrationen. Bestehende IFC-Lichtsimulation verlinkt, aber nicht automatisch mit frei benannten Geräten verknüpft. Gebäudeübersicht zeigt Dateifortschritt und passende nächste Schritte; Bearbeitung ist eingeklappt, Bereichsauswahl scrollbar.

Neue additive Geräte-API nutzt bestehende Gebäude-Mitgliedschaften. UUID-Wiederholung verhindert doppelte Anlage; Revision schützt vor überschriebenen Schaltzuständen. Keine echten Netzwerkgeräte, keine Messwerte erfunden, keine Kopplung oder Automationsregeln. Anforderungen und nächste Schnittstellenschritte stehen in [Geräte und API](../geraete-ios.md).

Validierung: 69 Backendtests erfolgreich, darunter sechs neue Geräteprüfungen für Rechte, Wiederholungen, Konflikte, Fremd-IDs, ungültige Angaben und Kapazitätsgrenze. Debug- und Release-Build für den iPhone-Simulator erfolgreich. Debug-App installiert und mit separaten lokalen Vorschau-Daten gestartet. Die sichtbare Bedienungsprüfung ist noch nicht bestätigt: Die Computerverbindung meldete das Simulator-Fenster als nicht verfügbar. Keine vollständige UI-Prüfung behaupten.
