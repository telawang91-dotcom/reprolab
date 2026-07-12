param(
    [string]$Python = "python",
    [switch]$Integration,
    [switch]$SkipFrontend
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

Push-Location (Join-Path $repoRoot "backend")
try {
    & $Python -m pytest -q
    if ($LASTEXITCODE -ne 0) { throw "Backend unit tests failed" }

    if ($Integration) {
        Push-Location $repoRoot
        try {
            docker compose up -d postgres
            if ($LASTEXITCODE -ne 0) { throw "PostgreSQL container failed to start" }
            $databaseReady = $false
            for ($attempt = 0; $attempt -lt 30; $attempt++) {
                docker compose exec -T postgres pg_isready -U reprolab -d reprolab | Out-Null
                if ($LASTEXITCODE -eq 0) { $databaseReady = $true; break }
                Start-Sleep -Seconds 2
            }
            if (-not $databaseReady) { throw "PostgreSQL did not become ready" }
            docker compose build sandbox
            if ($LASTEXITCODE -ne 0) { throw "Sandbox image build failed" }
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
        & $Python -m alembic upgrade head
        if ($LASTEXITCODE -ne 0) { throw "Database migration failed" }
        $env:RUN_INTEGRATION = "1"
        try {
            & $Python -m pytest tests/integration/test_p0_e2e.py tests/integration/test_m12_projects_e2e.py -q
            if ($LASTEXITCODE -ne 0) { throw "P0 integration acceptance failed" }
        }
        finally {
            $env:RUN_INTEGRATION = $null
            $env:DATABASE_URL = $previousDatabaseUrl
        }
    }
}
finally { Pop-Location }

if (-not $SkipFrontend) {
    Push-Location (Join-Path $repoRoot "frontend")
    try {
        npm.cmd run typecheck
        if ($LASTEXITCODE -ne 0) { throw "Frontend typecheck failed" }
        npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw "Frontend production build failed" }
    }
    finally { Pop-Location }
}

Write-Host "ReproLab quality checks passed." -ForegroundColor Green
