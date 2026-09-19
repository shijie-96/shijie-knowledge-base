# 构建 CloudStudio 部署暂存目录（仅源码，排除大体积产物）
$ErrorActionPreference = 'Stop'
$stage = 'd:\zhishi2.0\.deploy-stage'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }

# 逐个复制需要的顶层条目
New-Item -ItemType Directory -Path $stage -Force | Out-Null

function Copy-Clean($src, $dest) {
  robocopy $src $dest /E /XD node_modules .next dist coverage uploads .git .idea .vscode logs /XF *.log *.map 2>$null | Out-Null
}

Copy-Clean 'd:\zhishi2.0\backend'   "$stage\backend"
Copy-Clean 'd:\zhishi2.0\frontend'  "$stage\frontend"
Copy-Clean 'd:\zhishi2.0\nginx'     "$stage\nginx"
Copy-Clean 'd:\zhishi2.0\docs'      "$stage\docs"

# 顶层文件
Copy-Item 'd:\zhishi2.0\docker-compose.yml' "$stage\"
Copy-Item 'd:\zhishi2.0\README.md'          "$stage\" -ErrorAction SilentlyContinue

# backend/.env（含 DB_PASSWORD 等生产凭据，robocopy 已带，确保存在）
if (-not (Test-Path "$stage\backend\.env")) {
  Copy-Item 'd:\zhishi2.0\backend\.env' "$stage\backend\"
}

Write-Host '---stage size---'
$files = Get-ChildItem $stage -Recurse -File
$sum = ($files | Measure-Object Length -Sum).Sum / 1MB
Write-Host ("files:{0} size:{1:N1}MB" -f $files.Count, $sum)
Write-Host '---stage root---'
Get-ChildItem $stage | Select-Object -ExpandProperty Name
