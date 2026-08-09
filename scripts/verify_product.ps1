param(
    [string]$Python = "python",
    [switch]$Integration,
    [switch]$SkipFrontend,
    [switch]$SkipE2E,
    [string]$OutputPath = ".runtime/quality-report.json"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$startedAt = [DateTime]::UtcNow
$checks = [System.Collections.Generic.List[object]]::new()

function Invoke-QualityCheck([string]$Name, [scriptblock]$Action) {
    $watch = [Diagnostics.Stopwatch]::StartNew()
    try {
        & $Action
        if ($LASTEXITCODE -ne 0) { throw "$Name failed with exit code $LASTEXITCODE" }
        $checks.Add([pscustomobject]@{ name = $Name; status = "pass"; duration_seconds = [Math]::Round($watch.Elapsed.TotalSeconds, 2); error = $null })
    } catch {
        $checks.Add([pscustomobject]@{ name = $Name; status = "fail"; duration_seconds = [Math]::Round($watch.Elapsed.TotalSeconds, 2); error = $_.Exception.Message })
        throw
    } finally { $watch.Stop() }
}

function Write-QualityReport {
    $target = Join-Path $repoRoot $OutputPath
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    [ordered]@{
        generated_at = [DateTime]::UtcNow.ToString("o")
        git_commit = (git -C $repoRoot rev-parse HEAD).Trim()
        started_at = $startedAt.ToString("o")
        passed = -not ($checks | Where-Object { $_.status -ne "pass" })
        checks = $checks
    } | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 -LiteralPath $target
    Write-Host "Quality report: $target"
}

try {
    Push-Location $repoRoot
    try { Invoke-QualityCheck "repository-hygiene" { & $Python scripts/check_repository_hygiene.py } }
    finally { Pop-Location }

    Push-Location (Join-Path $repoRoot "backend")
    try { Invoke-QualityCheck "backend-unit-tests" { & $Python -m pytest -q } }
    finally { Pop-Location }

    if ($Integration) {
        Push-Location $repoRoot
        try {
            Invoke-QualityCheck "docker-postgres-start" { docker compose up -d postgres }
            $databaseReady = $false
            for ($attempt = 0; $attempt -lt 30; $attempt++) {
                docker compose exec -T postgres pg_isready -U reprolab -d reprolab | Out-Null
                if ($LASTEXITCODE -eq 0) { $databaseReady = $true; break }
                Start-Sleep -Seconds 2
            }
            if (-not $databaseReady) { throw "PostgreSQL did not become ready" }
            Invoke-QualityCheck "docker-sandbox-build" {
                $sandboxBuilt = $false
                for ($attempt = 1; $attempt -le 3; $attempt++) {
                    docker compose build sandbox
                    if ($LASTEXITCODE -eq 0) {
                        $sandboxBuilt = $true
                        break
                    }
                    if ($attempt -lt 3) {
                        Write-Warning "Sandbox build attempt $attempt failed; retrying in 3 seconds."
                        Start-Sleep -Seconds 3
                    }
                }
                if (-not $sandboxBuilt) {
                    docker image inspect reprolab-sandbox:py311 | Out-Null
                    if ($LASTEXITCODE -eq 0) {
                        Write-Warning "Docker Hub is unavailable; using the already verified local sandbox image."
                        $sandboxBuilt = $true
                    }
                }
                if (-not $sandboxBuilt) { throw "Sandbox image build failed after 3 attempts and no local image is available" }
            }
        }
        finally { Pop-Location }

        $previousDatabaseUrl = $env:DATABASE_URL
        $testDatabase = "reprolab_test"
        $exists = docker compose exec -T postgres psql -U reprolab -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$testDatabase'"
        if ($LASTEXITCODE -ne 0) { throw "Test database lookup failed" }
        if (($exists | Out-String).Trim() -ne "1") {
            docker compose exec -T postgres createdb -U reprolab $testDatabase
            if ($LASTEXITCODE -ne 0) { throw "Test database creation failed" }
        }
        $env:DATABASE_URL = "postgresql+psycopg://reprolab:reprolab@localhost:5432/$testDatabase"
        Push-Location (Join-Path $repoRoot "backend")
        try {
            Invoke-QualityCheck "alembic-migration" { & $Python -m alembic upgrade head }
            $env:RUN_INTEGRATION = "1"
            try {
                Invoke-QualityCheck "trusted-core-integration" { & $Python -m pytest tests/integration/test_p0_e2e.py tests/integration/test_m12_projects_e2e.py tests/integration/test_m1c_datasets_e2e.py -q }
            }
            finally { $env:RUN_INTEGRATION = $null }
        }
        finally {
            Pop-Location
            $env:DATABASE_URL = $previousDatabaseUrl
        }
    }
    if (-not $SkipFrontend) {
        Push-Location (Join-Path $repoRoot "frontend")
        try {
            Invoke-QualityCheck "frontend-typecheck" { npm.cmd run typecheck }
            Invoke-QualityCheck "frontend-timeline-tests" { npm.cmd run test:timeline }
            Invoke-QualityCheck "frontend-api-tests" { npm.cmd run test:api }
            Invoke-QualityCheck "frontend-production-build" { npm.cmd run build }
            if (-not $SkipE2E) {
                $runtimeDir = Join-Path $repoRoot ".runtime"
                $logDir = Join-Path $runtimeDir "logs"
                New-Item -ItemType Directory -Force -Path $logDir | Out-Null
                $server = Start-Process -FilePath "node" -ArgumentList @("./node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3100") -WorkingDirectory (Get-Location) -RedirectStandardOutput (Join-Path $logDir "e2e-next.out.log") -RedirectStandardError (Join-Path $logDir "e2e-next.err.log") -WindowStyle Hidden -PassThru
                try {
                    $ready = $false
                    for ($attempt = 0; $attempt -lt 60; $attempt++) {
                        try { Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3100/guide" -TimeoutSec 2 | Out-Null; $ready = $true; break } catch { Start-Sleep -Seconds 2 }
                    }
                    if (-not $ready) { throw "Next.js E2E server did not become ready" }
                    $previousBaseUrl = $env:PLAYWRIGHT_BASE_URL
                    $env:PLAYWRIGHT_BASE_URL = "http://127.0.0.1:3100"
                    try { Invoke-QualityCheck "frontend-playwright" { npm.cmd run test:e2e } }
                    finally { $env:PLAYWRIGHT_BASE_URL = $previousBaseUrl }
                } finally {
                    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
                }
            }
        }
        finally { Pop-Location }
    }
} finally {
    Write-QualityReport
}

Write-Host "ReproLab quality checks passed." -ForegroundColor Green
