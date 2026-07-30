param(
    [string]$Python = "",
    [string]$DatabaseUrl = "",
    [string]$ListenAddress = "127.0.0.1",
    [ValidateRange(1, 65535)]
    [int]$Port = 8000,
    [ValidateSet("docker", "host")]
    [string]$SandboxBackend = "host",
    [switch]$SkipMigrations,
    [switch]$AllowPublicHostSandbox
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $repoRoot "backend"
if (-not $Python) {
    $Python = Join-Path $repoRoot ".venv\Scripts\python.exe"
}
if (-not (Test-Path -LiteralPath $Python -PathType Leaf)) {
    throw "Python interpreter not found: $Python"
}

$isLoopback = $ListenAddress -in @("127.0.0.1", "localhost", "::1")
if (-not $isLoopback -and [string]::IsNullOrWhiteSpace($env:AGENT_API_TOKEN)) {
    throw "AGENT_API_TOKEN must be set before listening on a non-loopback address."
}
if (-not $isLoopback -and $SandboxBackend -eq "host" -and -not $AllowPublicHostSandbox) {
    throw "Refusing to expose the host execution backend publicly. Use Docker sandboxing or pass -AllowPublicHostSandbox only for trusted callers."
}

$previousDatabaseUrl = $env:DATABASE_URL
$previousSandboxBackend = $env:SANDBOX_BACKEND
try {
    if ($DatabaseUrl) {
        $env:DATABASE_URL = $DatabaseUrl
    }
    $env:SANDBOX_BACKEND = $SandboxBackend

    Push-Location $backendDir
    try {
        if (-not $SkipMigrations) {
            & $Python -m alembic upgrade head
            if ($LASTEXITCODE -ne 0) {
                throw "Database migration failed with exit code $LASTEXITCODE."
            }
        }
        Write-Host "ReproLab API: http://${ListenAddress}:$Port" -ForegroundColor Green
        Write-Host "OpenAPI docs: http://${ListenAddress}:$Port/docs" -ForegroundColor Green
        & $Python -m uvicorn app.main:app --host $ListenAddress --port $Port
        if ($LASTEXITCODE -ne 0) {
            throw "API process stopped with exit code $LASTEXITCODE."
        }
    } finally {
        Pop-Location
    }
} finally {
    $env:DATABASE_URL = $previousDatabaseUrl
    $env:SANDBOX_BACKEND = $previousSandboxBackend
}
