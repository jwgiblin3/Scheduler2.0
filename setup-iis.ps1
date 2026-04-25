<#
.SYNOPSIS
    One-time IIS setup for ProSchedule on the local machine.

.DESCRIPTION
    Creates the folder structure under C:\Apps\Scheduler, sets up the two
    IIS app pools (ScheduleAPI / ScheduleUI), creates the two sites with
    sensible defaults, and locks each one down to Anonymous-only auth.

    Idempotent — safe to re-run; existing pools / sites are left in place.

    Run this from an elevated PowerShell prompt (admin). After it succeeds,
    use deploy.ps1 to push code into the folders it just created.

.PARAMETER ApiPort
    HTTP port for the API site. Default 80 (the standard web port). Both
    sites can share port 80 because they're differentiated by host header.

.PARAMETER UiPort
    HTTP port for the UI site. Default 80.

.PARAMETER UiHostName
    Hostname binding for the UI site. Default "localhost".

.PARAMETER ApiHostName
    Hostname binding for the API site. Default "api.localhost". Modern
    browsers (Chrome, Edge, Firefox) treat anything matching *.localhost
    as 127.0.0.1 per RFC 6761, so no hosts-file edit is needed.

.PARAMETER DisableDefaultWebSite
    If specified, stops and disables the IIS "Default Web Site" so it can't
    fight for port 80. Default $true — required when our sites bind to 80.
#>

[CmdletBinding()]
param(
    [int]$ApiPort = 80,
    [int]$UiPort  = 80,
    [string]$UiHostName  = 'localhost',
    [string]$ApiHostName = 'api.localhost',
    [bool]$DisableDefaultWebSite = $true
)

$ErrorActionPreference = 'Stop'

# Verify elevation — IIS provider edits require admin rights.
$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)) {
    throw "This script must be run as Administrator."
}

Import-Module WebAdministration -ErrorAction Stop

# --- Paths -----------------------------------------------------------------
$Root         = 'C:\Apps\Scheduler'
$ApiDir       = Join-Path $Root 'ScheduleAPI'
$UiDir        = Join-Path $Root 'ScheduleUI'
$ApiPool      = 'ScheduleAPI'
$UiPool       = 'ScheduleUI'
$ApiSite      = 'ScheduleAPI'
$UiSite       = 'ScheduleUI'

function Write-Step { param($msg) Write-Host "`n==> $msg" -ForegroundColor Cyan }

# --- 0. Get Default Web Site out of the way --------------------------------
# IIS ships with a "Default Web Site" pre-bound to *:80 with no host header.
# That's a wildcard binding — it would steal traffic for any hostname on 80
# unless we either delete it or take it offline. We just stop it here; if you
# need it back, run `Start-Website "Default Web Site"`.
if ($DisableDefaultWebSite -and (Test-Path 'IIS:\Sites\Default Web Site')) {
    Write-Step "Stopping the IIS Default Web Site so it doesn't fight for port 80"
    try {
        Stop-Website -Name 'Default Web Site' -ErrorAction SilentlyContinue
        Set-ItemProperty -Path 'IIS:\Sites\Default Web Site' -Name serverAutoStart -Value $false
    } catch {
        Write-Warning "Could not stop Default Web Site: $($_.Exception.Message)"
    }
}

# --- 1. Folders ------------------------------------------------------------
Write-Step "Creating $Root"
New-Item -ItemType Directory -Force -Path $Root  | Out-Null
New-Item -ItemType Directory -Force -Path $ApiDir | Out-Null
New-Item -ItemType Directory -Force -Path $UiDir  | Out-Null

# --- 2. App pools ----------------------------------------------------------
function Ensure-AppPool {
    param(
        [string]$Name,
        [bool]$LoadUserProfile = $false
    )
    if (-not (Test-Path "IIS:\AppPools\$Name")) {
        Write-Host "Creating app pool '$Name'..."
        New-WebAppPool -Name $Name | Out-Null
    } else {
        Write-Host "App pool '$Name' already exists; updating settings."
    }
    # No Managed Code — required for ASP.NET Core (the app is hosted by ANCM,
    # not the .NET Framework runtime), and harmless for the static UI site.
    Set-ItemProperty -Path "IIS:\AppPools\$Name" -Name 'managedRuntimeVersion' -Value ''
    Set-ItemProperty -Path "IIS:\AppPools\$Name" -Name 'managedPipelineMode'   -Value 'Integrated'
    Set-ItemProperty -Path "IIS:\AppPools\$Name" -Name 'startMode'             -Value 'AlwaysRunning'
    Set-ItemProperty -Path "IIS:\AppPools\$Name" -Name 'processModel.identityType' -Value 'ApplicationPoolIdentity'
    if ($LoadUserProfile) {
        # Required for DataProtection keys, user secrets, and some EF tooling
        # to resolve under the app pool identity.
        Set-ItemProperty -Path "IIS:\AppPools\$Name" -Name 'processModel.loadUserProfile' -Value $true
    }
}

Write-Step "Configuring app pools"
Ensure-AppPool -Name $ApiPool -LoadUserProfile $true
Ensure-AppPool -Name $UiPool  -LoadUserProfile $false

# --- 3. ACLs ---------------------------------------------------------------
function Grant-AppPoolRead {
    param([string]$Path, [string]$PoolName)
    $sid = "IIS AppPool\$PoolName"
    Write-Host "Granting read to '$sid' on $Path"
    # Quoted because the SID contains a space — icacls otherwise mis-parses it.
    & icacls.exe $Path /grant ("$sid" + ':(OI)(CI)RX') /T /Q | Out-Null
}

Write-Step "Granting filesystem permissions"
Grant-AppPoolRead -Path $ApiDir -PoolName $ApiPool
Grant-AppPoolRead -Path $UiDir  -PoolName $UiPool

# --- 4. Sites --------------------------------------------------------------
function Ensure-Site {
    param(
        [string]$Name,
        [string]$PhysicalPath,
        [string]$AppPool,
        [int]   $Port,
        [string]$HostName = ''
    )
    if (Test-Path "IIS:\Sites\$Name") {
        Write-Host "Site '$Name' already exists; updating bindings/path."
        Set-ItemProperty -Path "IIS:\Sites\$Name" -Name physicalPath    -Value $PhysicalPath
        Set-ItemProperty -Path "IIS:\Sites\$Name" -Name applicationPool -Value $AppPool
        # Replace bindings entirely so re-running with different ports/hosts
        # doesn't accumulate old entries.
        $bindingInfo = "*:" + $Port + ":" + $HostName
        Set-ItemProperty -Path "IIS:\Sites\$Name" -Name bindings -Value @(@{
            protocol = 'http'; bindingInformation = $bindingInfo
        })
    } else {
        Write-Host "Creating site '$Name' on port $Port (host '$HostName')..."
        # Pick a non-default site ID so we don't collide with the Default Web Site (ID=1).
        $existingIds = (Get-Website | ForEach-Object { [int]$_.id })
        $maxId = ($existingIds | Measure-Object -Maximum).Maximum
        $newId = if ($maxId) { $maxId + 1 } else { 2 }
        New-Website -Name $Name -Id $newId -PhysicalPath $PhysicalPath `
                    -ApplicationPool $AppPool `
                    -Port $Port -HostHeader $HostName -Force | Out-Null
    }
}

Write-Step "Creating IIS sites"
Ensure-Site -Name $ApiSite -PhysicalPath $ApiDir -AppPool $ApiPool -Port $ApiPort -HostName $ApiHostName
Ensure-Site -Name $UiSite  -PhysicalPath $UiDir  -AppPool $UiPool  -Port $UiPort  -HostName $UiHostName

# --- 5. Authentication -----------------------------------------------------
# Both sites: Anonymous on, every other auth mode off. ProSchedule does its
# own auth via JWT — IIS just needs to forward requests.
function Set-AuthMode {
    param([string]$SiteName, [string]$Mode, [bool]$Enabled)
    Set-WebConfigurationProperty `
        -PSPath 'MACHINE/WEBROOT/APPHOST' -Location $SiteName `
        -Filter "system.webServer/security/authentication/$Mode" `
        -Name enabled -Value $Enabled
}

Write-Step "Setting Anonymous-only authentication"
foreach ($site in @($ApiSite, $UiSite)) {
    Set-AuthMode -SiteName $site -Mode 'anonymousAuthentication'      -Enabled $true
    Set-AuthMode -SiteName $site -Mode 'windowsAuthentication'        -Enabled $false
    Set-AuthMode -SiteName $site -Mode 'basicAuthentication'          -Enabled $false
    Set-AuthMode -SiteName $site -Mode 'digestAuthentication'         -Enabled $false
}

# --- 6. ASPNETCORE_ENVIRONMENT for the API ---------------------------------
# Ensures the API picks up appsettings.Production.json automatically.
Write-Step "Setting ASPNETCORE_ENVIRONMENT=Production on API site"
Set-WebConfigurationProperty `
    -PSPath 'MACHINE/WEBROOT/APPHOST' -Location $ApiSite `
    -Filter 'system.webServer/aspNetCore/environmentVariables' `
    -Name '.' -Value @{name='ASPNETCORE_ENVIRONMENT'; value='Production'} `
    -ErrorAction SilentlyContinue

# --- 7. Done ---------------------------------------------------------------
Write-Step "Setup complete"
Write-Host ""
Write-Host "  API folder : $ApiDir"
Write-Host "  UI  folder : $UiDir"
Write-Host ""

function Format-Url {
    param([string]$Hostname, [int]$Port)
    if ($Port -eq 80) { return "http://$Hostname/" }
    return "http://${Hostname}:$Port/"
}
$apiHostDisplay = if ($ApiHostName) { $ApiHostName } else { 'localhost' }
$uiHostDisplay  = if ($UiHostName)  { $UiHostName  } else { 'localhost' }
$apiUrl = Format-Url -Hostname $apiHostDisplay -Port $ApiPort
$uiUrl  = Format-Url -Hostname $uiHostDisplay  -Port $UiPort
Write-Host "  API URL    : $apiUrl   (Swagger at ${apiUrl}swagger)"
Write-Host "  UI  URL    : $uiUrl"
Write-Host ""
Write-Host "Note: *.localhost resolves to 127.0.0.1 in modern browsers per RFC 6761,"
Write-Host "      so 'http://api.localhost' works without any hosts-file changes."
Write-Host ""
Write-Host "Next: run .\deploy.ps1 to publish the code into the folders above." -ForegroundColor Green
