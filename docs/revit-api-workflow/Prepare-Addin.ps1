param([string]$RevitDir = 'C:\Program Files\Autodesk\Revit 2027')
$ErrorActionPreference = 'Stop'
$project = Join-Path $PSScriptRoot 'GstRevitWorkflow.csproj'
dotnet build $project --configuration Release --ignore-failed-sources "-p:RevitDir=$RevitDir"
if ($LASTEXITCODE -ne 0) { throw 'Build fehlgeschlagen.' }
$assembly = Join-Path $PSScriptRoot 'bin\Release\net10.0-windows\GstRevitWorkflow.dll'
$escaped = [Security.SecurityElement]::Escape($assembly)
$manifest = @"
<?xml version="1.0" encoding="utf-8"?>
<RevitAddIns>
  <AddIn Type="Command">
    <Name>GST Neues Projekt</Name>
    <Assembly>$escaped</Assembly>
    <AddInId>D0342B91-448E-4D6E-B39C-7ED2AB658AB2</AddInId>
    <FullClassName>GstRevitWorkflow.NewProject</FullClassName>
    <Text>GST Neues Projekt</Text>
    <VendorId>GST1</VendorId>
    <VendorDescription>GST Teamprojekt Team 1</VendorDescription>
  </AddIn>
  <AddIn Type="Command">
    <Name>GST Raumpruefung RVT IFC</Name>
    <Assembly>$escaped</Assembly>
    <AddInId>2AC8DD05-B496-4263-8521-9BF2A955C2AF</AddInId>
    <FullClassName>GstRevitWorkflow.ValidateSaveExport</FullClassName>
    <Text>GST Raumpruefung RVT IFC</Text>
    <VendorId>GST1</VendorId>
    <VendorDescription>GST Teamprojekt Team 1</VendorDescription>
  </AddIn>
</RevitAddIns>
"@
$manifestPath = Join-Path $PSScriptRoot 'GstRevitWorkflow.addin'
[IO.File]::WriteAllText($manifestPath, $manifest, (New-Object Text.UTF8Encoding($false)))
Write-Output "Manifest vorbereitet: $manifestPath"
Write-Output 'Nicht automatisch installiert. Vor Revit-Neustart alle offenen Projekte separat sichern.'
