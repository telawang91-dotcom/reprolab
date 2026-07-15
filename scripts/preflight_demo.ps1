param(
    [string]$BaseUrl = "http://127.0.0.1:8000",
    [string]$FrontendUrl = "http://127.0.0.1:3000",
    [string]$ProjectId = "",
    [string]$OutputPath = ".runtime/demo-preflight.json"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$checks = [System.Collections.Generic.List[object]]::new()

function Add-Check([string]$Key, [bool]$Passed, [string]$Message, [string]$Action = "") {
    $checks.Add([pscustomobject]@{ key = $Key; passed = $Passed; message = $Message; action = $Action })
}

try {
    $server = docker info --format '{{.ServerVersion}}' 2>$null
    Add-Check "docker" ($LASTEXITCODE -eq 0 -and [bool]$server) "Docker Engine $server" "Start Docker Desktop/Engine"
} catch { Add-Check "docker" $false "Docker Engine is unavailable" "Start Docker Desktop/Engine" }

try {
    $image = docker image inspect reprolab-sandbox:py311 --format '{{.Id}}' 2>$null
    Add-Check "sandbox_image" ($LASTEXITCODE -eq 0 -and [bool]$image) "Sandbox image is available" "docker compose build sandbox"
} catch { Add-Check "sandbox_image" $false "Sandbox image is missing" "docker compose build sandbox" }

try {
    $health = Invoke-RestMethod -Uri "$BaseUrl/health" -TimeoutSec 5
    Add-Check "backend" ($health.status -eq "ok" -and $health.database -eq "online") "Backend and database are online" "Start PostgreSQL and FastAPI"
} catch { Add-Check "backend" $false "Backend health endpoint is unreachable" "Start PostgreSQL and FastAPI" }

try {
    $runtime = Invoke-RestMethod -Uri "$BaseUrl/api/v1/settings/runtime" -TimeoutSec 8
    Add-Check "runtime" ($runtime.state -eq "ready") $runtime.summary "Follow component recovery actions"
} catch { Add-Check "runtime" $false "Runtime endpoint is unreachable" "Inspect backend logs" }

try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $FrontendUrl -TimeoutSec 5
    Add-Check "frontend" ($response.StatusCode -eq 200) "Frontend HTTP $($response.StatusCode)" "Start Next.js"
} catch { Add-Check "frontend" $false "Frontend is unreachable" "Start Next.js" }

if ($ProjectId) {
    try {
        $quality = Invoke-RestMethod -Uri "$BaseUrl/api/v1/projects/$ProjectId/quality-report" -TimeoutSec 8
        $qualityMessage = if ($quality.ready_for_demo) { "Project trusted loop is ready" } else { "Blockers: " + ($quality.blockers -join "; ") }
        Add-Check "project_quality" ([bool]$quality.ready_for_demo) $qualityMessage "Follow next_actions"
    } catch { Add-Check "project_quality" $false "Project quality report is unreachable" "Verify Project UUID" }
}

$report = [ordered]@{
    generated_at = [DateTime]::UtcNow.ToString("o")
    git_commit = (git -C $repoRoot rev-parse HEAD).Trim()
    passed = -not ($checks | Where-Object { -not $_.passed })
    checks = $checks
}
$target = Join-Path $repoRoot $OutputPath
$targetDir = Split-Path -Parent $target
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
$report | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 -LiteralPath $target
$checks | Format-Table key, passed, message -AutoSize
Write-Host "Preflight report: $target"
if (-not $report.passed) { exit 1 }
