# ติด hook (Claude Code + Codex) ในโฟลเดอร์ทดลองเท่านั้น (Windows PowerShell) ไม่ติด global
# ใช้: powershell -ExecutionPolicy Bypass -File setup-sandbox.ps1 [-Dir C:\path\to\project]  (ไม่ใส่ = ~\wai-sandbox)
param([string]$Dir = 'sandbox')
$ErrorActionPreference = 'Stop'
node (Join-Path $PSScriptRoot 'install-hooks.mjs') install $Dir both
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$shown = if ($Dir -eq 'sandbox') { Join-Path $HOME 'wai-sandbox' } else { $Dir }
Write-Host "Claude Code: cd '$shown'; claude"
