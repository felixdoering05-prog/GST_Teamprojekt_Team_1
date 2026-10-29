# IFC-Interaktion und Lichtsimulation

Datum: 29. Oktober 2026

Felix wünscht Farbwahl und Ausblenden einzelner IFC-Bauteile sowie eine raumbezogene Lichtsimulation im Smart-Home-Tab.

Umgesetzt: vollständige IFC-Elementauswahl, Farbwahl, Ausblenden, Wiederherstellen und Farbreset; Long-Press mit Abbruch bei Bewegungen; eigener Smart-Home-Tab mit Modellwahl; Schalter für geometrisch darstellbare IFCSPACE-Räume und sichtbare warme Raummarkierung. Keine Verbindung zu echten Lampen, keine dauerhafte Speicherung oder Veränderung des Originalmodells.

Das bereitgestellte D21-Modell enthält keine IFCSPACE-Objekte. Daher muss ein weiterer Revit-Export Räume samt Raumgeometrie enthalten. Es wurden keine Räume aus Wänden geraten. Das Originalmodell bleibt außerhalb des Repositories.

Prüfung: JavaScript-Funktionstest mit mehrteiligen IFC-Elementen; Xcode-Simulator-Build; lokaler Browser-Test mit dem bereitgestellten Modell und eigener Raum-Testdatei. API, Datenbank und Produktivserver bleiben unverändert.
