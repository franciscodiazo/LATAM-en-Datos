param(
  [ValidateSet('backup', 'restore')]
  [string]$Mode = 'backup',
  [string]$DumpFile = '',
  [string]$DbHost = '',
  [int]$DbPort = 0,
  [string]$DbUser = '',
  [string]$DbName = '',
  [string]$MySqlBinDir = 'C:\xampp\mysql\bin'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-EnvMap {
  param([string]$EnvPath)

  $map = @{}
  if (-not (Test-Path $EnvPath)) {
    return $map
  }

  foreach ($line in Get-Content -Path $EnvPath) {
    $trimmed = $line.Trim()
    if ([string]::IsNullOrWhiteSpace($trimmed)) { continue }
    if ($trimmed.StartsWith('#')) { continue }
    $idx = $trimmed.IndexOf('=')
    if ($idx -lt 1) { continue }

    $key = $trimmed.Substring(0, $idx).Trim()
    $value = $trimmed.Substring($idx + 1).Trim()

    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    $map[$key] = $value
  }

  return $map
}

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$envPath = Join-Path $projectRoot '.env'
$envMap = Get-EnvMap -EnvPath $envPath

if ([string]::IsNullOrWhiteSpace($DbHost)) { $DbHost = $envMap['DB_HOST'] }
if ($DbPort -le 0) {
  $portFromEnv = $envMap['DB_PORT']
  if (-not [int]::TryParse($portFromEnv, [ref]$DbPort)) {
    $DbPort = 3306
  }
}
if ([string]::IsNullOrWhiteSpace($DbUser)) { $DbUser = $envMap['DB_USER'] }
if ([string]::IsNullOrWhiteSpace($DbName)) { $DbName = $envMap['DB_NAME'] }

$dbPasswordText = $env:DB_PASSWORD
if ([string]::IsNullOrWhiteSpace($dbPasswordText)) {
  $dbPasswordText = $envMap['DB_PASSWORD']
}
if ($null -eq $dbPasswordText) {
  $dbPasswordText = ''
}

if ([string]::IsNullOrWhiteSpace($DbHost)) { $DbHost = 'localhost' }
if ([string]::IsNullOrWhiteSpace($DbUser)) { throw 'DB_USER no está definido en .env ni por parámetro.' }
if ([string]::IsNullOrWhiteSpace($DbName)) { throw 'DB_NAME no está definido en .env ni por parámetro.' }

$mysqlExe = Join-Path $MySqlBinDir 'mysql.exe'
$mysqldumpExe = Join-Path $MySqlBinDir 'mysqldump.exe'

if (-not (Test-Path $mysqlExe)) {
  throw "No se encontró mysql.exe en $mysqlExe"
}
if (-not (Test-Path $mysqldumpExe)) {
  throw "No se encontró mysqldump.exe en $mysqldumpExe"
}

$dumpsDir = Join-Path $projectRoot 'dumps'
if (-not (Test-Path $dumpsDir)) {
  New-Item -ItemType Directory -Path $dumpsDir | Out-Null
}

if ($Mode -eq 'backup') {
  if ([string]::IsNullOrWhiteSpace($DumpFile)) {
    $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $DumpFile = Join-Path $dumpsDir "$DbName`_$stamp.sql"
  }

  $dumpArgs = @(
    "--host=$DbHost",
    "--port=$DbPort",
    "--user=$DbUser",
    "--password=$dbPasswordText",
    '--default-character-set=utf8mb4',
    '--single-transaction',
    '--skip-lock-tables',
    $DbName
  )

  Write-Host "[DB] Generando backup: $DumpFile"
  $rawDump = & $mysqldumpExe @dumpArgs 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Error ejecutando mysqldump: $rawDump"
  }

  $rawDump | Set-Content -Path $DumpFile -Encoding UTF8
  $latestFile = Join-Path $dumpsDir "$DbName`_latest.sql"
  Copy-Item -Path $DumpFile -Destination $latestFile -Force

  Write-Host "[DB] Backup OK: $DumpFile"
  Write-Host "[DB] Copia latest: $latestFile"
  exit 0
}

if ([string]::IsNullOrWhiteSpace($DumpFile)) {
  $DumpFile = Join-Path $dumpsDir "$DbName`_latest.sql"
}

if (-not (Test-Path $DumpFile)) {
  throw "No se encontró el archivo SQL para restore: $DumpFile"
}

Write-Host "[DB] Restaurando desde: $DumpFile"
$escapedMySql = '"' + $mysqlExe + '"'
$cmd = "$escapedMySql --host=$DbHost --port=$DbPort --user=$DbUser --password=$dbPasswordText $DbName < `"$DumpFile`""
cmd.exe /c $cmd
if ($LASTEXITCODE -ne 0) {
  throw 'Error durante restore de MySQL.'
}

Write-Host '[DB] Restore OK'
