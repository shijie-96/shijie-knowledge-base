$ErrorActionPreference = 'Stop'
$stage = 'd:\zhishi2.0\.deploy-stage'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null

function Copy-Clean($src, $dest) {
  robocopy $src $dest /E /XD node_modules .next dist coverage uploads .git .idea .vscode logs /XF *.log *.map 2>$null | Out-Null
}

Copy-Clean 'd:\zhishi2.0\backend'   "$stage\backend"
Copy-Clean 'd:\zhishi2.0\frontend'  "$stage\frontend"
Copy-Clean 'd:\zhishi2.0\nginx'     "$stage\nginx"
Copy-Clean 'd:\zhishi2.0\docs'      "$stage\docs"
Copy-Item 'd:\zhishi2.0\docker-compose.yml' "$stage\"
Copy-Item 'd:\zhishi2.0\README.md'          "$stage\" -ErrorAction SilentlyContinue

Write-Host '---verify .env---'
Get-Content "$stage\backend\.env" | Select-String 'DB_HOST|REDIS_HOST'
$files = Get-ChildItem $stage -Recurse -File
Write-Host ("files:{0} size:{1:N1}MB" -f $files.Count, (($files | Measure-Object Length -Sum).Sum / 1MB))
