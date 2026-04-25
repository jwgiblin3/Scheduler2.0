<#
.SYNOPSIS
    Build and deploy ProSchedule (API + Angular UI) to local IIS.

.DESCRIPTION
    Builds both projects, stops the IIS app pool to release file locks,
    wipes the target directory, copies the fresh output, and restarts.

    Run as Administrator — touching IIS and %PROGRAMFILES%-adjacent folders
    needs elevation.

.PARAMETER Target
    Which project to build/deploy. Defaults to "all".

.EXAMPLE
    .\deploy.ps1                    # full build + deploy
    .\deploy.ps1 -Target api        # API only (UI untouched)
    .\deploy.ps1 -Target ui         # UI only
    .\deploy.ps1 -NoBuild           # skip build, redeploy last output
#>

[CmdletBinding()]
param(
    [ValidateSet('all', 'api', 'ui')]
    [string]$Target = 'all',

    [switch]$NoBuild
)

$ErrorActionPreference = 'Stop'

# --- Environment checks ---------------------------------------------------
# Anything that touches the IIS provider needs (a) admin rights and (b) the
# IIS Management Scripts/Tools sub-feature installed. If either is missing,
# we still want the file-copy half of the deploy to work — we just skip the
# pool stop/start and ask the user to bounce the pool by hand.
$identity   = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal  = New-Object Security.Principal.WindowsPrincipal($identity)
$IsAdmin    = $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)

$IisAvailable = $false
if ($IsAdmin) {
    Import-Module WebAdministration -ErrorAction SilentlyContinue
    if (Get-Command Get-WebAppPoolState -ErrorAction SilentlyContinue) {
        try {
            # Force-load the provider so a cold start surfaces the COM error
            # here instead of mid-deploy. A successful Get-Item proves both
            # the WebAdministration cmdlets and the underlying IIS COM
            # provider (CLSID 688EEEE5-...) are wired up.
            Get-Item 'IIS:\AppPools\DefaultAppPool' -ErrorAction Stop | Out-Null
            $IisAvailable = $true
        } catch {
            Write-Warning ("IIS provider isn't responding: " + $_.Exception.Message)
            Write-Warning "Falling back to file-copy only. You'll need to bounce the IIS app pools manually."
        }
    }
}
if (-not $IsAdmin) {
    Write-Warning "Not running elevated. IIS app-pool management will be skipped."
    Write-Warning "If you need automatic pool restarts, re-run this script from an Administrator PowerShell."
}

# --- Paths -----------------------------------------------------------------
$RepoRoot     = $PSScriptRoot
$ApiProject   = Join-Path $RepoRoot 'ProScheduleAPI\ProScheduleAPI.csproj'
$ApiPublish   = Join-Path $RepoRoot 'artifacts\api'
$UiProject    = Join-Path $RepoRoot 'pryschedule-ui'
$UiDist       = Join-Path $UiProject 'dist\pryschedule-ui\browser'  # Angular 17+ output

$ApiDeployDir = 'C:\Apps\Scheduler\ScheduleAPI'
$UiDeployDir  = 'C:\Apps\Scheduler\ScheduleUI'

# IIS App Pool names — adjust if you named them differently in IIS.
$ApiAppPool = 'ScheduleAPI'
$UiAppPool  = 'ScheduleUI'

function Write-Step { param($msg) Write-Host "`n==> $msg" -ForegroundColor Cyan }

# --- Helpers ---------------------------------------------------------------

function Stop-Pool {
    param([string]$Name)
    if (-not $IisAvailable) { return }
    if (-not (Test-Path "IIS:\AppPools\$Name")) {
        Write-Host "App pool '$Name' doesn't exist yet — run setup-iis.ps1 first."
        return
    }
    try {
        $state = (Get-WebAppPoolState -Name $Name).Value
        if ($state -eq 'Started') {
            Write-Host "Stopping app pool '$Name'..."
            Stop-WebAppPool -Name $Name
            # Give IIS a moment to actually release handles.
            Start-Sleep -Seconds 2
        }
    } catch {
        Write-Warning "Couldn't stop pool '$Name': $($_.Exception.Message)"
    }
}

function Start-Pool {
    param([string]$Name)
    if (-not $IisAvailable) { return }
    if (-not (Test-Path "IIS:\AppPools\$Name")) { return }
    try {
        Write-Host "Starting app pool '$Name'..."
        Start-WebAppPool -Name $Name
    } catch {
        Write-Warning "Couldn't start pool '$Name': $($_.Exception.Message)"
    }
}

function Sync-Folder {
    param([string]$Source, [string]$Destination)
    if (-not (Test-Path $Destination)) { New-Item -ItemType Directory -Force -Path $Destination | Out-Null }
    # Robocopy is the right tool here — /MIR makes the destination match the
    # source exactly (including deletes), /XO avoids replacing newer-in-dest
    # files, /NFL/NDL keeps logs terse. Exit codes 0–7 are success in robocopy.
    robocopy $Source $Destination /MIR /R:2 /W:2 /NFL /NDL /NJH /NJS | Out-Null
    if ($LASTEXITCODE -ge 8) {
        throw "robocopy failed copying $Source → $Destination (exit $LASTEXITCODE)"
    }
}

# --- API -------------------------------------------------------------------

function Deploy-Api {
    if (-not $NoBuild) {
        Write-Step "Publishing API → $ApiPublish"
        if (Test-Path $ApiPublish) { Remove-Item -Recurse -Force $ApiPublish }
        dotnet publish $ApiProject -c Release -o $ApiPublish --nologo
        if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed" }
    }

    Write-Step "Deploying API → $ApiDeployDir"
    Stop-Pool -Name $ApiAppPool
    Sync-Folder -Source $ApiPublish -Destination $ApiDeployDir
    Start-Pool -Name $ApiAppPool
    Write-Host "API deployed." -ForegroundColor Green
}

# --- UI --------------------------------------------------------------------

function Deploy-Ui {
    if (-not $NoBuild) {
        Write-Step "Building Angular UI (production)"
        Push-Location $UiProject
        try {
            # Clean install if node_modules is missing (fresh clone).
            if (-not (Test-Path (Join-Path $UiProject 'node_modules'))) {
                npm ci
                if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
            }
            npm run build -- --configuration production
            if ($LASTEXITCODE -ne 0) { throw "ng build failed" }
        } finally {
            Pop-Location
        }
    }

    if (-not (Test-Path $UiDist)) {
        throw "UI output folder not found at $UiDist. Check Angular build output path."
    }

    Write-Step "Deploying UI → $UiDeployDir"
    Stop-Pool -Name $UiAppPool
    Sync-Folder -Source $UiDist -Destination $UiDeployDir
    Start-Pool -Name $UiAppPool
    Write-Host "UI deployed." -ForegroundColor Green
}

# --- Main ------------------------------------------------------------------

switch ($Target) {
    'api' { Deploy-Api }
    'ui'  { Deploy-Ui }
    'all' { Deploy-Api; Deploy-Ui }
}

Write-Host "`nDone." -ForegroundColor Green
