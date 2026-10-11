# ติด hook ไว้เฉพาะใน %USERPROFILE%\wai-sandbox (ห้ามติดแบบ global ตอน dev) · เทียบเท่า setup-sandbox.sh ของ mac
# ไม่เขียน JSON เอง ให้ install-hooks.mjs ทำ (merge + backup + marker เหมือนปุ่มใน onboarding)
#
#   powershell -ExecutionPolicy Bypass -File spikes\popup-hook\setup-sandbox.ps1
#
# ไฟล์นี้ต้องเซฟเป็น UTF-8 แบบมี BOM · รองรับ Windows PowerShell 5.1 และ pwsh 7 (ยังไม่ได้ทดสอบบนเครื่อง Windows จริง)
$ErrorActionPreference = 'Stop'

$Spike    = (Resolve-Path -LiteralPath $PSScriptRoot).ProviderPath
$Electron = Join-Path $Spike 'node_modules\electron\dist\electron.exe'
$Lib      = Join-Path $Spike 'install-hooks.mjs'

if (-not (Test-Path -LiteralPath $Electron)) {
  throw "ไม่เจอ $Electron · รัน npm --prefix spikes\popup-hook install ก่อน"
}

# ส่ง path ผ่าน env ไม่ต้องยัด quote ใน -e (PowerShell 5.1 ส่ง " ให้ exe เพี้ยน) · ใน JS ห้ามมี "
$env:WAI_IH_URL  = (New-Object System.Uri $Lib).AbsoluteUri
$env:WAI_RUNTIME = $Electron   # hook รันด้วย electron.exe (ELECTRON_RUN_AS_NODE=1) เครื่องผู้ใช้ไม่ต้องมี node
$js = "import(process.env.WAI_IH_URL).then(function(m){for(const t of ['claude','codex'])console.log('ok '+m.install(t,'sandbox',process.env.WAI_RUNTIME))}).catch(function(e){console.error(e&&e.stack||e);process.exit(1)})"

# มี node ก็ใช้ node (console app) ไม่งั้นใช้ electron.exe เป็น node
$node = Get-Command node -ErrorAction SilentlyContinue
$prevRunAsNode = $env:ELECTRON_RUN_AS_NODE
try {
  if ($node) {
    $runner = $node.Source
  } else {
    $runner = $Electron
    $env:ELECTRON_RUN_AS_NODE = '1'
  }
  $ErrorActionPreference = 'Continue'   # PS 5.1: stderr ของ exe + 2>&1 + Stop = throw ทันที
  # pipe เสมอ: electron.exe เป็นแอป GUI ถ้าไม่ pipe PowerShell จะไม่รอและไม่เห็น output
  & $runner -e $js 2>&1 | ForEach-Object { Write-Host ([string]$_) }
  if ($LASTEXITCODE -ne 0) { throw "ติด hook ไม่สำเร็จ (exit $LASTEXITCODE)" }
} finally {
  $env:ELECTRON_RUN_AS_NODE = $prevRunAsNode
  Remove-Item Env:WAI_IH_URL, Env:WAI_RUNTIME -ErrorAction SilentlyContinue
}

$Dir = Join-Path $env:USERPROFILE 'wai-sandbox'
Write-Host ''
Write-Host "ติด hook แล้วใน $Dir (.claude\settings.local.json + .codex\hooks.json)"
Write-Host "Claude Code: cd `"$Dir`"; claude"
Write-Host "Codex: เปิดโฟลเดอร์ $Dir ใน Codex แล้วพิมพ์ /hooks กด trust ก่อน (ไม่ trust = hook ไม่รัน)"
