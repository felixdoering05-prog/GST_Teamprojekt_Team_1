# Arbeitsprotokoll: App-Symbol für KI trifft Gebäude

Datum: 28. Oktober 2026. Umsetzung: Felix mit Codex.

Neues Symbol: geometrisches Gebäude mit integrierten KI-Leiterbahnen, Türkis/Weiß auf Dunkelblau. Ohne Text, damit es auch auf dem Home-Bildschirm lesbar bleibt. Der Startbildschirm und das bisherige Projektlogo bleiben unverändert.

Datei: `ios/KI Trifft Gebäude APP/KI Trifft Gebäude APP/Assets.xcassets/AppIcon.appiconset/AppIcon.png` (1024 × 1024, vollständig deckendes PNG). In beiden Target-Konfigurationen wird `ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon` gesetzt. Xcode erzeugt die benötigten kleineren Symbole. [Apple: App-Icon mit Asset-Katalog konfigurieren](https://developer.apple.com/documentation/xcode/configuring-your-app-icon).

Erstellung: integriertes `image_gen`-Werkzeug (keine separate API/CLI). Das generierte 1254-Quadrat wurde für den Asset-Katalog auf 1024 × 1024 skaliert. Es werden keine Kontodaten oder Serverdaten benötigt.

## Verwendeter Prompt

> Use case: logo-brand. Asset type: production iOS app icon for a German university building digital twin app named KI trifft Gebäude, GST team project. Create ONE square 1024x1024 icon image. Full bleed completely opaque deep midnight navy background (#0B1626), subtle tasteful tonal gradient. Center a single striking architectural symbol: a compact isometric modern building/digital twin made of precise thick luminous turquoise (#21D1CF) and soft white geometric planes and a few clearly defined square windows. One short restrained circuit trace with two nodes integrated into the upper right of the building, suggesting AI connected to architecture. Premium minimal Apple app icon aesthetic, architectural clarity, strong clean silhouette, flat vector-like geometric finish with very subtle depth, broad generous safe margin, balanced composition. Recognizable at 40 pixels. No text, no letters, no numbers, no university logo, no badges, no watermark. Do not draw rounded outer corners or an outer frame; iOS applies the corner mask itself. Deliver the icon artwork only, not a phone mockup, no surrounding whitespace.

Validierung: PNG-Abmessungen und fehlende Transparenz geprüft; signierter iOS-Simulator-Debug-Build; generierte Info.plist enthält CFBundlePrimaryIcon/AppIcon. Auf einem physischen iPhone wird das Symbol nach erneutem Installieren der App geprüft.
