# สร้าง shortcut "ไหว้กูซะ" ใน Start Menu (Windows) กดเปิดจาก Start search ได้ · เทียบเท่า install-shortcut.sh ของ mac
# shortcut ชี้มาที่โฟลเดอร์ repo นี้ ถ้าย้าย repo ให้รันสคริปต์นี้ใหม่
#
#   powershell -ExecutionPolicy Bypass -File spikes\popup-hook\install-shortcut.ps1            # ติดตั้ง
#   powershell -ExecutionPolicy Bypass -File spikes\popup-hook\install-shortcut.ps1 -Desktop   # + ไอคอนบน Desktop
#   powershell -ExecutionPolicy Bypass -File spikes\popup-hook\install-shortcut.ps1 -Uninstall # ลบ
#
# ไฟล์นี้ต้องเซฟเป็น UTF-8 แบบมี BOM ไม่งั้น Windows PowerShell 5.1 อ่านภาษาไทยเพี้ยน
# รองรับ Windows PowerShell 5.1 และ pwsh 7 (ยังไม่ได้ทดสอบบนเครื่อง Windows จริง)
[CmdletBinding()]
param(
  [switch]$Desktop,
  [switch]$Uninstall
)
$ErrorActionPreference = 'Stop'

$Name      = 'ไหว้กูซะ'
$Home2     = Join-Path $env:LOCALAPPDATA 'waikusa'            # launcher + log
$StartLnk  = Join-Path ([Environment]::GetFolderPath('Programs')) "$Name.lnk"   # %APPDATA%\Microsoft\Windows\Start Menu\Programs
$DeskLnk   = Join-Path ([Environment]::GetFolderPath('Desktop')) "$Name.lnk"

if ($Uninstall) {
  foreach ($p in @($StartLnk, $DeskLnk, $Home2)) {
    if (Test-Path -LiteralPath $p) {
      Remove-Item -LiteralPath $p -Recurse -Force
      Write-Host "ลบ $p แล้ว"
    }
  }
  exit 0
}

$Spike    = (Resolve-Path -LiteralPath $PSScriptRoot).ProviderPath
$Renderer = (Resolve-Path -LiteralPath (Join-Path $Spike '..\..\app\renderer')).ProviderPath
$Electron = Join-Path $Spike 'node_modules\electron\dist\electron.exe'

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw 'ไม่เจอ node ใน PATH · ติดตั้ง Node.js (LTS) ก่อน แล้วเปิด PowerShell ใหม่' }
$NodeDir = Split-Path -Parent $node.Source   # จำไว้ตอนติดตั้ง เผื่อ PATH ตอนกดจาก Start Menu ไม่เหมือน terminal

# ใช้ npm.cmd ตรงๆ (npm.ps1 อาจโดน execution policy บล็อก)
function Invoke-Npm([string[]]$NpmArgs) {
  & npm.cmd @NpmArgs
  if ($LASTEXITCODE -ne 0) { throw "npm $($NpmArgs -join ' ') ล้มเหลว (exit $LASTEXITCODE)" }
}

Write-Host 'ติดตั้ง dependency...'
Invoke-Npm @('--prefix', $Spike, 'install', '--silent')
Invoke-Npm @('--prefix', $Renderer, 'install', '--silent')
if (-not (Test-Path -LiteralPath $Electron)) { throw "ไม่เจอ $Electron · npm install ของ spike ไม่ครบ?" }

# file:///C:/.../app/renderer/dist/ (Thai/ช่องว่างถูก percent-encode เป็น ASCII ล้วน)
$DistDir     = (Join-Path $Renderer 'dist') + '\'
$RendererUrl = (New-Object System.Uri $DistDir).AbsoluteUri

New-Item -ItemType Directory -Force -Path $Home2 | Out-Null
$Log       = Join-Path $Home2 'wai-kusa.log'
$LaunchPs1 = Join-Path $Home2 'launch.ps1'
$LaunchVbs = Join-Path $Home2 'launch.vbs'

function Q([string]$s) { "'" + $s.Replace("'", "''") + "'" }   # single-quoted literal ของ PowerShell

# launch.ps1: build หน้าตา แล้วเปิด Electron · log ต่อท้ายเป็น UTF-8
$launch = @"
# สร้างโดย install-shortcut.ps1 ห้ามแก้มือ (รันสคริปต์ติดตั้งใหม่แทน)
`$ErrorActionPreference = 'Continue'
`$env:PATH = $(Q $NodeDir) + ';' + `$env:PATH
`$log = $(Q $Log)
function Log { process { Add-Content -LiteralPath `$log -Encoding UTF8 -Value ([string]`$_) } }
"=== `$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Log
# build หน้าตาทุกครั้งที่เปิด (ไม่กี่วิ) จะได้ตรงกับโค้ดล่าสุดใน repo
& npm.cmd --prefix $(Q $Renderer) run build 2>&1 | Log
`$env:WAI_RENDERER_URL = $(Q $RendererUrl)
# electron.exe เป็นแอป GUI ต้อง pipe ไม่งั้น PowerShell ไม่รอ/ไม่ได้ log
& $(Q $Electron) $(Q $Spike) 2>&1 | Log
"@
[IO.File]::WriteAllText($LaunchPs1, $launch, (New-Object System.Text.UTF8Encoding $true))   # มี BOM เพราะ path อาจเป็นไทย

# launch.vbs: ตัวกลางเปิด powershell แบบซ่อนหน้าต่าง (กันจอดำค้าง) · เซฟ UTF-16 LE + BOM เพื่อให้ WSH อ่าน path ไทยได้
$psExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$vbs = @"
' สร้างโดย install-shortcut.ps1
CreateObject("WScript.Shell").Run """$psExe"" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""$LaunchPs1""", 0, False
"@
[IO.File]::WriteAllText($LaunchVbs, $vbs, [System.Text.Encoding]::Unicode)

# ไอคอน: ใช้ .ico จาก assets ถ้ามี (.lnk ใช้ PNG ไม่ได้) ไม่งั้นใช้ไอคอนของ electron.exe
$Icon = "$Electron,0"
$ico = Get-ChildItem -LiteralPath (Join-Path $Spike 'assets') -Filter '*.ico' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($ico) { $Icon = "$($ico.FullName),0" }

$wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
function New-Shortcut([string]$Path) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
  $sh  = New-Object -ComObject WScript.Shell
  $lnk = $sh.CreateShortcut($Path)
  $lnk.TargetPath       = $wscript
  $lnk.Arguments        = '"' + $LaunchVbs + '"'
  $lnk.WorkingDirectory = $Spike
  $lnk.IconLocation     = $Icon
  $lnk.Description      = $Name
  $lnk.Save()
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($sh)
  Write-Host "สร้าง $Path"
}

New-Shortcut $StartLnk
if ($Desktop) { New-Shortcut $DeskLnk }

Write-Host ''
Write-Host "เสร็จ · กด Win แล้วพิมพ์ '$Name' · log อยู่ที่ $Log"
Write-Host "renderer: $RendererUrl"
