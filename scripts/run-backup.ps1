<#
.SYNOPSIS
    OfferNepal PostgreSQL backup runner (scheduler-friendly).

.DESCRIPTION
    Mirrors scripts/backup-database.sh so the identical backup procedure runs on
    a Windows workstation (Task Scheduler) and inside the Linux backup image.

    Produces:  backups/offernepal_<YYYYMMDD_HHMMSS>.dump.gz
    Optional:  .gz.enc  (when BACKUP_ENCRYPT_KEY is set)  +  .sha256 manifest

    Built for unattended runs:
      - exits non-zero on failure so the scheduler records a failed job
      - deletes partial artifacts so a truncated file is never a "backup"
      - -DryRun resolves and prints the whole plan without pg_dump or a DB

.PARAMETER DryRun
    Validate configuration and report planned actions without dumping.

.PARAMETER BackupDir
    Override BACKUP_DIR (default: .\backups)

.PARAMETER RetentionDays
    Override BACKUP_RETENTION_DAYS (default: 30)

.EXAMPLE
    .\scripts\run-backup.ps1 -DryRun
    .\scripts\run-backup.ps1
#>
[CmdletBinding()]
param(
    [switch]$DryRun,
    [string]$BackupDir,
    [int]$RetentionDays = 0
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ASCII-only output is a hard requirement here. Windows PowerShell 5.1 reads
# .ps1 as ANSI, so a multi-byte char in a string literal corrupts parsing.
$script:LogLines = New-Object System.Collections.ArrayList
# Absolute path of the run log, assigned during config resolution. Null until
# then; Write-Log falls back to in-memory only so early failures still emit.
$script:LogPath = $null

function Write-Log {
    param([string]$Message)
    $stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    $line = '[' + $stamp + '] ' + $Message
    [void]$script:LogLines.Add($line)
    Write-Output $line

    # Persist every line as it happens. A scheduled run at 03:00 has no console
    # to read, so if the job dies mid-run this file is the only evidence of why.
    if ($script:LogPath) {
        try {
            Add-Content -LiteralPath $script:LogPath -Value $line -Encoding ASCII -ErrorAction Stop
        }
        catch {
            # A read-only or locked log must never abort a backup. Drop the path
            # so we stop retrying on every subsequent line and finish the run.
            $script:LogPath = $null
        }
    }
}

function Stop-WithError {
    param([string]$Message)
    Write-Log ('ERROR: ' + $Message)
    # A non-zero exit code is the only failure signal a scheduler can see.
    exit 1
}

function Get-EnvValue {
    param([string]$Name)
    # Set-StrictMode-safe: the environment provider returns null for unset vars.
    return [Environment]::GetEnvironmentVariable($Name)
}

function Import-DotEnv {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) { return }

    foreach ($raw in Get-Content -LiteralPath $Path) {
        $line = $raw.Trim()
        if ($line -eq '' -or $line.StartsWith('#')) { continue }

        $split = $line.IndexOf('=')
        if ($split -lt 1) { continue }

        $key = $line.Substring(0, $split).Trim()
        $val = $line.Substring($split + 1).Trim()
        if ([string]::IsNullOrWhiteSpace($key)) { continue }

        # Strip surrounding quotes so quoted values are usable.
        if ($val.Length -ge 2 -and (($val.StartsWith('"') -and $val.EndsWith('"')) -or
                                    ($val.StartsWith("'") -and $val.EndsWith("'")))) {
            $val = $val.Substring(1, $val.Length - 2)
        }

        # Dotenv convention: an already-set environment variable wins. .env only
        # fills gaps. Blindly overwriting would let a stale .env silently redirect
        # a scheduled run away from a database set by the scheduler.
        $existing = [Environment]::GetEnvironmentVariable($key, 'Process')
        if ([string]::IsNullOrWhiteSpace($existing)) {
            [Environment]::SetEnvironmentVariable($key, $val, 'Process')
        }
    }
}

function Find-PgDump {
    $cmd = Get-Command pg_dump.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $roots = @(
        (Join-Path $env:ProgramFiles 'PostgreSQL'),
        (Join-Path ${env:ProgramFiles(x86)} 'PostgreSQL')
    )

    $found = @()
    foreach ($root in $roots) {
        if (-not $root) { continue }
        if (-not (Test-Path -LiteralPath $root)) { continue }
        $found += Get-ChildItem -LiteralPath $root -Filter pg_dump.exe -Recurse -File `
            -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
    }

    if ($found.Count -gt 0) { return ($found | Sort-Object | Select-Object -Last 1) }
    return $null
}

function Compress-ToGzip {
    param(
        [string]$SourcePath,
        [string]$DestinationPath
    )

    # GZipStream avoids depending on a gzip binary, which Windows lacks.
    $inStream  = [System.IO.File]::OpenRead($SourcePath)
    $outStream = $null
    try {
        $outStream = [System.IO.File]::Create($DestinationPath)
        $gzip = New-Object System.IO.Compression.GZipStream(
            $outStream,
            [System.IO.Compression.CompressionLevel]::Optimal,
            $true
        )
        try {
            $inStream.CopyTo($gzip)
        }
        finally {
            $gzip.Dispose()
        }
    }
    finally {
        $inStream.Dispose()
        if ($outStream) { $outStream.Dispose() }
    }
}

function Format-FileSize {
    param([long]$Bytes)
    if ($Bytes -ge 1GB) { return ('{0:N2} GiB' -f ($Bytes / 1GB)) }
    if ($Bytes -ge 1MB) { return ('{0:N2} MiB' -f ($Bytes / 1MB)) }
    if ($Bytes -ge 1KB) { return ('{0:N2} KiB' -f ($Bytes / 1KB)) }
    return ('{0} B' -f $Bytes)
}

function Remove-PartialArtifacts {
    param([string[]]$Paths)
    foreach ($p in $Paths) {
        if (-not $p) { continue }
        Remove-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue
    }
}

# ---------------------------------------------------------------------------
# Resolve configuration
# ---------------------------------------------------------------------------
$repoRoot = Split-Path -Parent $PSScriptRoot
Import-DotEnv -Path (Join-Path $repoRoot '.env')

$databaseUrl = Get-EnvValue -Name 'DATABASE_URL'

if (-not $BackupDir) {
    $BackupDir = Get-EnvValue -Name 'BACKUP_DIR'
    if (-not $BackupDir) { $BackupDir = Join-Path $repoRoot 'backups' }
}

# Create the backup directory before the first log line: the run log lives here,
# and the preflight checks below must be able to record why they failed.
if (-not (Test-Path -LiteralPath $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

# Append-only run log. Matches the path scripts/register-backup-task.ps1
# advertises to operators when a scheduled job fails.
$script:LogPath = Join-Path $BackupDir 'backup-schedule.log'

if ($RetentionDays -le 0) {
    $envRetention = Get-EnvValue -Name 'BACKUP_RETENTION_DAYS'
    if ($envRetention) { [void][int]::TryParse($envRetention, [ref]$RetentionDays) }
    if ($RetentionDays -le 0) { $RetentionDays = 30 }
}

$encryptKey = Get-EnvValue -Name 'BACKUP_ENCRYPT_KEY'
$pgDump     = Find-PgDump

Write-Log ('OfferNepal backup run starting (DryRun=' + $(if ($DryRun) { 'yes' } else { 'no' }) + ')')
Write-Log ('  backup dir      : ' + $BackupDir)
Write-Log ('  retention days  : ' + $RetentionDays)
Write-Log ('  encryption      : ' + $(if ($encryptKey) { 'enabled' } else { 'disabled' }))
Write-Log ('  DATABASE_URL    : ' + $(if ($databaseUrl) { 'present' } else { 'MISSING' }))
Write-Log ('  pg_dump         : ' + $(if ($pgDump) { $pgDump } else { 'not found' }))

# ---------------------------------------------------------------------------
# Preflight. Fails even under -DryRun so a scheduler surfaces a misconfigured
# job immediately instead of on the night an outage needs the backup.
# ---------------------------------------------------------------------------
if (-not $databaseUrl) {
    Stop-WithError 'DATABASE_URL is required (set it in the environment or .env).'
}

if (-not $pgDump) {
    Stop-WithError 'pg_dump.exe not found. Install PostgreSQL client tools and retry.'
}

$timestamp = (Get-Date).ToUniversalTime().ToString('yyyyMMdd_HHmmss')
$dumpFile  = Join-Path $BackupDir ('offernepal_' + $timestamp + '.dump')
$gzFile    = $dumpFile + '.gz'

Write-Log ('  planned dump    : ' + $dumpFile)

if ($DryRun) {
    Write-Log 'DryRun: skipping directory creation, dump, compression and pruning.'
    Write-Log ('DryRun: configuration valid. A real run would write: ' + $gzFile)
    exit 0
}

# ---------------------------------------------------------------------------
# Backup
# ---------------------------------------------------------------------------
if (-not (Test-Path -LiteralPath $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

Write-Log 'Starting pg_dump (custom format)...'

# --no-owner / --no-privileges keep the dump portable across roles.
# --clean --if-exists makes restores idempotent into an existing database.
$dumpArgs = @(
    $databaseUrl,
    '--format=custom',
    '--no-owner',
    '--no-privileges',
    '--clean',
    '--if-exists',
    ('--file=' + $dumpFile)
)

try {
    $dumpOutput = & $pgDump @dumpArgs 2>&1
    $dumpExit   = $LASTEXITCODE
}
catch {
    Remove-PartialArtifacts -Paths @($dumpFile)
    Stop-WithError ('pg_dump threw: ' + $_.Exception.Message)
}

if ($dumpExit -ne 0) {
    $detail = ($dumpOutput | Out-String).Trim()
    Remove-PartialArtifacts -Paths @($dumpFile)
    Stop-WithError ('pg_dump exited ' + $dumpExit + ': ' + $detail)
}

if (-not (Test-Path -LiteralPath $dumpFile)) {
    Stop-WithError 'pg_dump reported success but produced no file.'
}

$rawBytes = (Get-Item -LiteralPath $dumpFile).Length
if ($rawBytes -le 0) {
    Remove-PartialArtifacts -Paths @($dumpFile)
    Stop-WithError 'Dump file is empty - the dump produced no output.'
}

Write-Log ('Raw dump complete (' + (Format-FileSize -Bytes $rawBytes) + ')')

# ---------------------------------------------------------------------------
# Compression
# ---------------------------------------------------------------------------
Write-Log 'Compressing backup...'
try {
    Compress-ToGzip -SourcePath $dumpFile -DestinationPath $gzFile
}
catch {
    Remove-PartialArtifacts -Paths @($dumpFile, $gzFile)
    Stop-WithError ('Compression failed: ' + $_.Exception.Message)
}

# The uncompressed dump is never needed once compression succeeds.
Remove-Item -LiteralPath $dumpFile -Force -ErrorAction SilentlyContinue

$gzBytes = (Get-Item -LiteralPath $gzFile).Length
if ($gzBytes -le 0) {
    Remove-PartialArtifacts -Paths @($gzFile)
    Stop-WithError 'Compressed backup is empty.'
}
Write-Log ('Compressed to ' + (Format-FileSize -Bytes $gzBytes))

# ---------------------------------------------------------------------------
# Optional encryption
# ---------------------------------------------------------------------------
$finalFile = $gzFile

if ($encryptKey) {
    $openssl = Get-Command openssl -ErrorAction SilentlyContinue
    if (-not $openssl) {
        Remove-PartialArtifacts -Paths @($gzFile)
        Stop-WithError 'BACKUP_ENCRYPT_KEY is set but openssl was not found.'
    }

    Write-Log 'Encrypting backup (AES-256-CBC)...'
    $encFile = $gzFile + '.enc'
    try {
        $encOut = & $openssl.Source 'enc' '-aes-256-cbc' '-salt' '-pbkdf2' '-iter' '100000' `
            ('-in='  + $gzFile) `
            ('-out=' + $encFile) `
            ('-pass=pass:' + $encryptKey) 2>&1
        $encExit = $LASTEXITCODE
    }
    catch {
        Remove-PartialArtifacts -Paths @($gzFile, $encFile)
        Stop-WithError ('openssl threw: ' + $_.Exception.Message)
    }

    if ($encExit -ne 0 -or -not (Test-Path -LiteralPath $encFile)) {
        $detail = ($encOut | Out-String).Trim()
        Remove-PartialArtifacts -Paths @($gzFile, $encFile)
        Stop-WithError ('openssl exited ' + $encExit + ': ' + $detail)
    }

    # Only the ciphertext survives; drop the plaintext compressed file.
    Remove-Item -LiteralPath $gzFile -Force -ErrorAction SilentlyContinue
    $finalFile = $encFile
    Write-Log ('Encrypted backup: ' + $finalFile)
}

$finalBytes = (Get-Item -LiteralPath $finalFile).Length
Write-Log ('Backup ready: ' + $finalFile + ' (' + (Format-FileSize -Bytes $finalBytes) + ')')

# ---------------------------------------------------------------------------
# Checksum - lets you verify integrity before trusting a restore.
# ---------------------------------------------------------------------------
try {
    $hash = (Get-FileHash -LiteralPath $finalFile -Algorithm SHA256).Hash.ToLower()
    $manifest  = $finalFile + '.sha256'
    $fileName  = Split-Path -Leaf $finalFile
    # sha256sum-compatible format so the Linux verify path still works.
    Set-Content -LiteralPath $manifest -Value ($hash + '  ' + $fileName) -NoNewline -Encoding ASCII
    Write-Log ('Checksum written: ' + $manifest)
}
catch {
    # A missing checksum is not a failed backup; the dump itself is intact.
    Write-Log ('WARN: could not write checksum: ' + $_.Exception.Message)
}

# ---------------------------------------------------------------------------
# Retention pruning
# ---------------------------------------------------------------------------
Write-Log ('Pruning backups older than ' + $RetentionDays + ' days...')
$cutoff = (Get-Date).ToUniversalTime().AddDays(-1 * $RetentionDays)
$pruned = 0
try {
    $stale = Get-ChildItem -LiteralPath $BackupDir -File -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -like 'offernepal_*.dump*' -and
            $_.Name -notlike '*.sha256' -and
            $_.LastWriteTimeUtc -lt $cutoff
        }

    foreach ($item in $stale) {
        Remove-Item -LiteralPath $item.FullName -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath ($item.FullName + '.sha256') -Force -ErrorAction SilentlyContinue
        Write-Log ('  pruned ' + $item.Name)
        $pruned++
    }
}
catch {
    Write-Log ('WARN: retention prune encountered an error (non-fatal): ' + $_.Exception.Message)
}

if ($pruned -eq 0) { Write-Log '  nothing to prune' }

Write-Log ('Backup completed successfully: ' + $finalFile)
exit 0

