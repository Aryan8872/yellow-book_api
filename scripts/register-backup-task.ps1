<#
.SYNOPSIS
    Registers (or removes) the OfferNepal database backup in Windows Task Scheduler.

.DESCRIPTION
    The project is not a git repository, so a GitHub Actions workflow cannot be
    used. This registers a local scheduled task that runs
    scripts/run-backup.ps1 on a daily cadence.

    Defaults: daily at 03:00 local time, 4-hour retry, 90-minute max runtime.

.PARAMETER TaskName
    Scheduled task name. Default: OfferNepal-DatabaseBackup

.PARAMETER Time
    Daily run time as HH:mm (24-hour, local). Default: 03:00

.PARAMETER Remove
    Unregister the task instead of creating it.

.PARAMETER WhatIf
    Show what would be registered without changing anything.

.EXAMPLE
    .\scripts\register-backup-task.ps1 -WhatIf
    .\scripts\register-backup-task.ps1
    .\scripts\register-backup-task.ps1 -Time 23:30
    .\scripts\register-backup-task.ps1 -Remove
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$TaskName = 'OfferNepal-DatabaseBackup',
    [string]$Time = '03:00',
    [switch]$Remove
)

# ASCII-only: Windows PowerShell 5.1 reads .ps1 as ANSI, so multi-byte
# characters in string literals corrupt parsing.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot   = Split-Path -Parent $PSScriptRoot
$runnerPath = Join-Path $repoRoot 'scripts\run-backup.ps1'
$logDir     = Join-Path $repoRoot 'backups'
$logPath    = Join-Path $logDir 'backup-schedule.log'

function Write-Info {
    param([string]$Message)
    Write-Output $Message
}

if (-not (Test-Path -LiteralPath $runnerPath)) {
    throw "Runner not found: $runnerPath"
}

# ---------------------------------------------------------------------------
# Remove
# ---------------------------------------------------------------------------
if ($Remove) {
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if (-not $existing) {
        Write-Info ("Task not registered: " + $TaskName)
        exit 0
    }
    if ($PSCmdlet.ShouldProcess($TaskName, 'Remove scheduled task')) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Info ("Removed scheduled task: " + $TaskName)
    }
    exit 0
}

# ---------------------------------------------------------------------------
# Validate the time argument
# ---------------------------------------------------------------------------
$parsed = [datetime]::MinValue
if (-not [datetime]::TryParse($Time, [ref]$parsed)) {
    throw ("Invalid -Time value '" + $Time + "'. Use 24-hour HH:mm, e.g. 03:00 or 23:30.")
}
$runTime = $parsed.ToString('HH:mm')

# ---------------------------------------------------------------------------
# Build the action: powershell.exe runs the runner, appending to a log file so
# a scheduler-run failure is still diagnosable after the fact.
# ---------------------------------------------------------------------------
$psExe = Join-Path $PSHOME 'powershell.exe'

# -NoProfile avoids user profile state changing behaviour under the scheduler.
# -ExecutionPolicy Bypass is required because the script is unsigned and the
# scheduler runs under a non-interactive session.
$psArgs = '-NoProfile -ExecutionPolicy Bypass -File "' + $runnerPath + '"'

$action = New-ScheduledTaskAction `
    -Execute $psExe `
    -Argument $psArgs `
    -WorkingDirectory $repoRoot

$trigger = New-ScheduledTaskTrigger -Daily -At $runTime

$settings = New-ScheduledTaskSettingsSet `
    -MultipleInstances IgnoreNew `
    -StartWhenAvailable `
    -DontStopOnIdleEnd `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)

# Restart up to 3 times, 15 minutes apart, so a transient DB/network blip does
# not silently lose a night's backup.
$settings.RestartCount = 3
$settings.RestartInterval = 'PT15M'

$principal = New-ScheduledTaskPrincipal `
    -UserId $env:USERNAME `
    -LogonType Interactive `
    -RunLevel Limited

$description = 'Runs OfferNepal PostgreSQL backup (scripts/run-backup.ps1) daily.'

Write-Info 'Planned scheduled task:'
Write-Info ('  name       : ' + $TaskName)
Write-Info ('  daily at   : ' + $runTime + ' (local time)')
Write-Info ('  runs as    : ' + $env:USERNAME)
Write-Info ('  command    : ' + $psExe + ' ' + $psArgs)
Write-Info ('  on failure : exit code recorded; log in ' + $logPath)

if (-not $PSCmdlet.ShouldProcess($TaskName, 'Register scheduled task')) {
    Write-Info 'WhatIf: no changes made.'
    exit 0
}

if (-not (Test-Path -LiteralPath $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

# Register-ScheduledTask overwrites an existing task with the same name.
Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description $description `
    -Force | Out-Null

Write-Info ''
Write-Info ('Registered: ' + $TaskName)
Write-Info ''
Write-Info 'Verify with:'
Write-Info ('  Get-ScheduledTask -TaskName "' + $TaskName + '"')
Write-Info ('  Get-ScheduledTaskInfo -TaskName "' + $TaskName + '"')
Write-Info 'Run once now to prove it works:'
Write-Info ('  Start-ScheduledTask -TaskName "' + $TaskName + '"')
Write-Info 'Unregister later with:'
Write-Info ('  .\scripts\register-backup-task.ps1 -Remove')

exit 0
