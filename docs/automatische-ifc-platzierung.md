# Automatische IFC-Platzierung

Stand: 5. November 2026, iPhone 1.0.98.

Modell öffnen → Modell auf Karte → Automatisch platzieren & Karte laden. Ohne gespeicherten Standort und ohne unterstützte IFC-Georeferenz einmal die Gebäudeadresse eingeben. Zahlenfelder und manuelles Speichern stehen unter Details.

Die App ermittelt den ursprünglichen IFC-Modellmittelpunkt trotz Viewer-Ursprungsverschiebung. Der Server wertet IfcMapConversion mit explizitem EPSG, Einheiten und Achsen aus: ETRS89/UTM 32/33, WGS84/UTM und Web Mercator. Alternativ werden IfcSite-GPS und TrueNorth verwendet. Nicht unterstützte Kontexttransformationen werden nicht geraten. Eine Abweichung von mehr als 250 m gegenüber einem gespeicherten Standort verhindert dessen automatische Übernahme.

Ohne belastbare Georeferenz vergleicht die App den Modellumriss mit einem passenden vorhandenen OSM-Gebäudegrundriss. Das ergibt nur einen Näherungsvorschlag; Vorder- und Rückseite können um 180° mehrdeutig bleiben. Quadratische, widersprüchliche oder deutlich abweichende Grundrisse werden nicht automatisch gedreht. Der Modellmaßstab wird nicht passend verzerrt.

Die Modellgeometrie bleibt unverändert. Die Platzierung wird über die vorhandene, versionierte Karten-API gespeichert; nur Eigentümer dürfen sie ändern. Die Metadatenprüfung lädt keine externen Geodaten. Erst der Kartenlade-Knopf überträgt den 100 × 100 m großen Kartenausschnitt an den bestehenden Overpass-Dienst. Die IFC-Datei wird dort nicht hochgeladen. Es gibt keine Verbindung zu einem amtlichen Geoportal und keine Zusicherung vermessungstechnischer Genauigkeit.
