$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
$localNode=Get-ChildItem "$PSScriptRoot\.tools\node-*-win-x64\node.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($localNode) { & $localNode.FullName --env-file-if-exists=.env server.mjs } else { node --env-file-if-exists=.env server.mjs }

