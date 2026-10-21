# ChatGPT / Codex mit Autodesk Revit verbinden (Team-Anleitung)

Stand: Oktober 2026 · Projekt: GST Team 1

## Ziel und Architektur
Codex läuft auf dem **Windows-Rechner bzw. der Windows-VM, auf der Revit installiert ist**. Über einen **Revit-kompatiblen MCP-Server mit zugehörigem Revit-Add-in** kann Codex Werkzeuge in Revit aufrufen. **Codex allein steuert Revit nicht.** Die genaue MCP-Konfiguration hängt vom ausgewählten Revit-Connector ab.

## 1. Voraussetzungen
- Autodesk Revit (bei uns Revit 2027) auf Windows, gestartet und mit einem Testprojekt geöffnet
- Internetzugang und Berechtigung, Add-ins zu installieren
- Optional Visual Studio Code für die Projektdateien
- Node.js LTS von https://nodejs.org/ (nur erforderlich, wenn Codex über npm installiert wird oder der gewählte MCP-Server Node.js benötigt)
- Codex CLI: https://github.com/openai/codex
- **Zusätzlich erforderlich:** Ein explizit zu Revit 2027 kompatibles **Revit-MCP-Add-in plus passender MCP-Server**. Bezugsquelle und Installationsanleitung des konkret gewählten Projekts prüfen. Es gibt keinen universellen offiziellen Revit-MCP-Server, der hier vorausgesetzt werden kann.

## 2. Node.js und Codex installieren (Windows PowerShell)
Node.js LTS installieren, PowerShell neu starten, Versionen prüfen:

```powershell
node --version
npm.cmd --version
```

Codex installieren (mit `npm.cmd`, um das häufige PowerShell-Problem mit blockiertem `npm.ps1` zu umgehen):

```powershell
npm.cmd install -g @openai/codex
codex --version
codex
```

Bei der ersten Ausführung **Sign in with ChatGPT** wählen und anmelden. Alternativ die offizielle Standalone-Installation gemäß Codex-README verwenden.

**Typischer Fehler:** „npm.ps1 kann nicht geladen werden, da die Ausführung von Skripts deaktiviert ist.“ Lösung: `npm.cmd` statt `npm` verwenden; dafür muss die PowerShell-Execution-Policy nicht global gelockert werden.

## 3. Revit-MCP-Connector einrichten
1. Im Team auf **einen konkreten Revit-MCP-Connector** einigen und dessen GitHub-Repository/Version dokumentieren.
2. Prüfen, ob **Revit 2027**, die verwendete Windows-Version und die eingesetzte Codex-MCP-Schnittstelle unterstützt werden.
3. Das **Revit-Add-in** nach dessen README installieren; prüfen, ob es in Revit geladen wird.
4. Den **MCP-Server** entsprechend der Anleitung installieren und starten. Manche Implementierungen verwenden Node.js, andere Python oder .NET.
5. Server-Startbefehl, Argumente, Ports und Umgebungsvariablen aus der Connector-Dokumentation übernehmen – **nicht raten**.
6. Den MCP-Server bei Codex registrieren (Beispielstruktur, Platzhalter **nicht direkt ausführen**):

```powershell
codex mcp add revit -- <SERVER-BEFEHL> <SERVER-ARGUMENTE>
codex mcp list
```

7. Revit mit einem **Testmodell** öffnen, Codex starten und zunächst nur lesende Funktionen testen, z. B. verfügbare MCP-Werkzeuge oder Modellinformationen abfragen.
8. Erst danach eine kleine, rückgängig zu machende Änderung testen; Ergebnis direkt in Revit kontrollieren.

## 4. Testanfragen an Codex
- „Liste die verfügbaren MCP-Tools für Revit auf. Verändere nichts.“
- „Prüfe, ob eine Verbindung zum geöffneten Revit-Modell besteht.“
- „Lies die Ebenen aus dem Testmodell aus. Keine Änderungen.“
- „Erkläre vor der Ausführung, welche Elemente du ändern würdest, und warte auf meine Freigabe.“

## 5. Hinweise für das Team
- **Mac:** Revit läuft in unserem Setup auf Windows/VM; Add-in und MCP-Server müssen dort erreichbar sein. Bei getrennter Ausführung auf dem Mac sind Netzwerk- und Transportkonfiguration gesondert zu prüfen.
- Vor jeder Änderung eine Sicherung des Revit-Modells anlegen; nicht direkt am produktiven Zentralmodell testen.
- Nur vertrauenswürdige Add-ins installieren; Connector-Code und Berechtigungen prüfen.
- Keine API-Keys, Zugangsdaten oder vertraulichen BIM-Pläne ins öffentliche GitHub-Repository hochladen.
- KI-generierte Änderungen und Bauteilparameter fachlich überprüfen.

## 6. Noch vom Team zu ergänzen
- Name und URL des tatsächlich eingesetzten Revit-MCP-Connectors
- Exakte Installationsbefehle und MCP-Konfiguration dieses Connectors
- Bestätigter Funktionstest mit Revit 2027 (inklusive Versionsnummern und Screenshot)

## Quellen
- Codex CLI: https://github.com/openai/codex
- Codex-Dokumentation: https://developers.openai.com/codex/
- Node.js: https://nodejs.org/
