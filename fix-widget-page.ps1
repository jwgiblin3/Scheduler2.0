<#
.SYNOPSIS
    Move a "Save Page As" HTML file into its sibling assets folder and fix
    every relative reference so the page still loads correctly.

.DESCRIPTION
    Browsers that save a page in "Webpage, Complete" mode produce two pieces
    side-by-side: an HTML file at the top of the folder and a "_files" sibling
    holding every CSS, JS, image, and font the page pulled in. References
    inside the HTML are then prefixed with "<foldername>/..." to point into
    that sibling folder.

    When you move the HTML *into* that folder, every relative reference that
    starts with the folder name becomes broken — they're now one level too
    deep. This script does the move and strips that prefix in one shot.

    Also handles a few common Save-Page-As quirks:
      * Strips <base href="..."> tags that pin the page to its original URL.
      * Removes <script> or <link> entries pointing at the original site's
        analytics/tracking endpoints (safe to drop locally).
      * Leaves URL-encoded forms (DRJoe%2F) alone — those aren't paths.

.PARAMETER HtmlPath
    Path to the saved HTML file. Default "C:\Apps\Scheduler\index.html".

.PARAMETER AssetsFolder
    Path to the assets folder created by the browser. Default
    "C:\Apps\Scheduler\DRJoe".

.PARAMETER Backup
    If specified (default), keeps a copy of the original HTML next to it
    with a ".backup" suffix before deleting it.

.EXAMPLE
    .\fix-widget-page.ps1
    .\fix-widget-page.ps1 -HtmlPath C:\Apps\Scheduler\index.html -AssetsFolder C:\Apps\Scheduler\DRJoe
#>

[CmdletBinding()]
param(
    [string]$HtmlPath      = 'C:\Apps\Scheduler\index.html',
    [string]$AssetsFolder  = 'C:\Apps\Scheduler\DRJoe',
    [switch]$Backup        = $true
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $HtmlPath))     { throw "HTML file not found: $HtmlPath" }
if (-not (Test-Path $AssetsFolder)) { throw "Assets folder not found: $AssetsFolder" }

# Folder *name* (the leaf component) — this is the prefix that needs to be
# stripped from every relative reference. Quoted in regex to neutralize any
# special characters in the name.
$folderName = Split-Path $AssetsFolder -Leaf
$folderRegex = [regex]::Escape($folderName)

Write-Host "Reading $HtmlPath..."
$html = Get-Content -Raw -LiteralPath $HtmlPath

# --- 1. Strip <base> tags --------------------------------------------------
# These usually point back at the original site and override every relative
# path on the page, which means the browser tries to fetch assets from the
# real domain instead of our local copy.
$html = [regex]::Replace($html, '<base\b[^>]*>', '', 'IgnoreCase')

# --- 2. Strip references with the folder prefix ---------------------------
# Matches src="DRJoe/...", href='DRJoe\\...', url(DRJoe/...), and the same
# patterns prefixed with "./". Both forward- and backslash separators are
# handled because Save-Page-As output isn't always consistent.
$patterns = @(
    # attribute values: src="DRJoe/...", href='./DRJoe\...'
    '(?i)((?:src|href|poster|data-src)\s*=\s*["''])(?:\./)?'+$folderRegex+'[/\\]',
    # CSS url(): url("DRJoe/..."), url(DRJoe/...)
    '(?i)(url\(\s*["'']?)(?:\./)?'+$folderRegex+'[/\\]',
    # srcset entries: srcset="DRJoe/foo.jpg 1x, DRJoe/foo@2x.jpg 2x"
    '(?i)(\s|,)(?:\./)?'+$folderRegex+'[/\\]'
)
$totalMatches = 0
foreach ($p in $patterns) {
    $matches = [regex]::Matches($html, $p)
    $totalMatches += $matches.Count
    $html = [regex]::Replace($html, $p, '$1')
}

# --- 3. Drop tracking/analytics scripts pointing at external domains ------
# These commonly fail loudly on a static local copy and aren't useful here.
$trackerPatterns = @(
    '(?is)<script\b[^>]*\bsrc=["''][^"'']*google-analytics[^"'']*["''][^>]*>\s*</script>',
    '(?is)<script\b[^>]*\bsrc=["''][^"'']*googletagmanager[^"'']*["''][^>]*>\s*</script>',
    '(?is)<script\b[^>]*\bsrc=["''][^"'']*facebook\.net[^"'']*["''][^>]*>\s*</script>'
)
$trackerHits = 0
foreach ($p in $trackerPatterns) {
    $hits = [regex]::Matches($html, $p).Count
    $trackerHits += $hits
    $html = [regex]::Replace($html, $p, '')
}

# --- 4. Backup + write to new location ------------------------------------
$destPath = Join-Path $AssetsFolder 'index.html'
if ($Backup) {
    $backupPath = "$HtmlPath.backup"
    Copy-Item -LiteralPath $HtmlPath -Destination $backupPath -Force
    Write-Host "Backup saved → $backupPath"
}

# UTF-8 without BOM keeps the bytes identical to what the browser saved.
[System.IO.File]::WriteAllText($destPath, $html, [System.Text.UTF8Encoding]::new($false))
Write-Host "Wrote   → $destPath"

# Remove the original now that the moved copy is in place.
Remove-Item -LiteralPath $HtmlPath -Force
Write-Host "Removed → $HtmlPath"

Write-Host ""
Write-Host "Summary:" -ForegroundColor Green
Write-Host "  $totalMatches reference(s) had the '$folderName/' prefix stripped."
Write-Host "  $trackerHits external tracker script(s) removed."
Write-Host ""
Write-Host "Open it: start `"`" `"$destPath`""
