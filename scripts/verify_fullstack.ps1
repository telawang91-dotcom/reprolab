param(
    [string]$Python = "python",
    [string]$DatabaseUrl = "postgresql+psycopg://reprolab:reprolab@localhost:5432/reprolab_test",
    [string]$ApiBaseUrl = "http://127.0.0.1:8000",
    [string]$WebBaseUrl = "http://127.0.0.1:3100"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $repoRoot ".runtime"
$logDir = Join-Path $runtimeDir "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$backendProcess = $null
$frontendProcess = $null
$previousDatabaseUrl = $env:DATABASE_URL
$previousEmbeddingPreload = $env:EMBEDDING_PRELOAD
$previousCorsOrigins = $env:CORS_ORIGINS
$previousRunFullstack = $env:RUN_FULLSTACK_E2E
$previousPlaywrightBaseUrl = $env:PLAYWRIGHT_BASE_URL
$previousFullstackApiBase = $env:FULLSTACK_API_BASE

try {
    $env:DATABASE_URL = $DatabaseUrl
    $env:EMBEDDING_PRELOAD = "false"
    $env:CORS_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000,$WebBaseUrl"
    $backendProcess = Start-Process `
        -FilePath $Python `
        -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000") `
        -WorkingDirectory (Join-Path $repoRoot "backend") `
        -RedirectStandardOutput (Join-Path $logDir "fullstack-api.out.log") `
        -RedirectStandardError (Join-Path $logDir "fullstack-api.err.log") `
        -WindowStyle Hidden `
        -PassThru
    $frontendProcess = Start-Process `
        -FilePath "node" `
        -ArgumentList @("./node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3100") `
        -WorkingDirectory (Join-Path $repoRoot "frontend") `
        -RedirectStandardOutput (Join-Path $logDir "fullstack-next.out.log") `
        -RedirectStandardError (Join-Path $logDir "fullstack-next.err.log") `
        -WindowStyle Hidden `
        -PassThru

    $apiReady = $false
    $webReady = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        if (-not $apiReady) {
            try {
                $health = Invoke-RestMethod -Uri "$ApiBaseUrl/health" -TimeoutSec 2
                $apiReady = $health.status -eq "ok" -and $health.database -eq "online"
            } catch {}
        }
        if (-not $webReady) {
            try {
                Invoke-WebRequest -UseBasicParsing -Uri "$WebBaseUrl/demo" -TimeoutSec 2 | Out-Null
                $webReady = $true
            } catch {}
        }
        if ($apiReady -and $webReady) { break }
        Start-Sleep -Seconds 2
    }
    if (-not ($apiReady -and $webReady)) {
        throw "Full-stack services did not become ready (api=$apiReady, web=$webReady)"
    }

    $env:RUN_FULLSTACK_E2E = "1"
    $env:PLAYWRIGHT_BASE_URL = $WebBaseUrl
    $env:FULLSTACK_API_BASE = "$ApiBaseUrl/api/v1"
    Push-Location (Join-Path $repoRoot "frontend")
    try {
        npm.cmd run test:fullstack
        if ($LASTEXITCODE -ne 0) {
            throw "Full-stack Playwright failed with exit code $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }
} finally {
    $env:DATABASE_URL = $previousDatabaseUrl
    $env:EMBEDDING_PRELOAD = $previousEmbeddingPreload
    $env:CORS_ORIGINS = $previousCorsOrigins
    $env:RUN_FULLSTACK_E2E = $previousRunFullstack
    $env:PLAYWRIGHT_BASE_URL = $previousPlaywrightBaseUrl
    $env:FULLSTACK_API_BASE = $previousFullstackApiBase
    if ($frontendProcess) {
        Stop-Process -Id $frontendProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($backendProcess) {
        Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "ReproLab full-stack golden path passed." -ForegroundColor Green
