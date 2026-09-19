param()
$toolsDir = "d:\#1_GOOGLE_Antigravity\tools\node"
$parentDir = "d:\#1_GOOGLE_Antigravity\tools"

if (-not (Test-Path "$toolsDir\node.exe")) {
    if (-not (Test-Path $parentDir)) {
        New-Item -ItemType Directory -Force -Path $parentDir | Out-Null
    }
    $zipPath = "$parentDir\node.zip"
    Write-Host "Downloading Node.js v20.18.0 LTS..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri "https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip" -OutFile $zipPath
    Write-Host "Extracting..."
    Expand-Archive -Path $zipPath -DestinationPath $parentDir -Force
    Rename-Item -Path "$parentDir\node-v20.18.0-win-x64" -NewName "node"
    Remove-Item -Path $zipPath -Force
    Write-Host "Node.js installed successfully!"
}

& "$toolsDir\node.exe" -v
& "$toolsDir\npm.cmd" -v
