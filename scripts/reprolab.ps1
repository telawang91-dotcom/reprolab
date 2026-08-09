param(
    [Parameter(Position = 0)]
    [ValidateSet("start", "stop", "status", "logs", "doctor")]
    [string]$Action = "start",
    [switch]$NoBuild,
    [switch]$BuildSandbox,
    [switch]$Follow,
    [ValidateRange(1, 5000)]
    [int]$Tail = 120
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $repoRoot ".env"
$envExamplePath = Join-Path $repoRoot ".env.example"

function Invoke-Docker {
    param([string[]]$Arguments)

    & docker @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "docker $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
}

function Get-ConfiguredPort {
    param(
        [string]$Name,
        [int]$Default
    )

    $environmentValue = [Environment]::GetEnvironmentVariable($Name)
    if ($environmentValue) {
        return [int]$environmentValue
    }
    if (Test-Path -LiteralPath $envPath) {
        $line = Get-Content -LiteralPath $envPath -Encoding utf8 |
            Where-Object { $_ -match "^$([regex]::Escape($Name))=(.+)$" } |
            Select-Object -Last 1
        if ($line) {
            return [int](($line -split "=", 2)[1].Trim())
        }
    }
    return $Default
}

function Show-Endpoints {
    $webPort = Get-ConfiguredPort -Name "REPROLAB_PORT" -Default 3000
    $apiPort = Get-ConfiguredPort -Name "REPROLAB_API_PORT" -Default 8000
    Write-Host "Workbench: http://localhost:$webPort" -ForegroundColor Green
    Write-Host "API docs:  http://localhost:$apiPort/docs" -ForegroundColor Green
    Write-Host "Health:    http://localhost:$apiPort/health" -ForegroundColor Green
}

function Show-DoctorReport {
    $webPort = Get-ConfiguredPort -Name "REPROLAB_PORT" -Default 3000
    $apiPort = Get-ConfiguredPort -Name "REPROLAB_API_PORT" -Default 8000

    Write-Host "[ok] Docker Compose configuration is valid." -ForegroundColor Green
    if (Test-Path -LiteralPath $envPath) {
        Write-Host "[ok] Local configuration exists: .env" -ForegroundColor Green
    } else {
        Write-Host "[info] .env does not exist yet; start will create it from .env.example." -ForegroundColor Yellow
    }

    & docker compose ps --all
    if ($LASTEXITCODE -ne 0) {
        throw "Could not inspect ReproLab services."
    }

    $containerId = (& docker compose ps --quiet app).Trim()
    if (-not $containerId) {
        Write-Host "[info] ReproLab is not running. Run: .\scripts\reprolab.ps1 start" -ForegroundColor Yellow
        Show-Endpoints
        return
    }

    $health = (& docker inspect $containerId --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}").Trim()
    if ($health -ne "healthy") {
        throw "The app container is running but not healthy (state=$health). Run: .\scripts\reprolab.ps1 logs"
    }
    Write-Host "[ok] Application container is healthy." -ForegroundColor Green

    try {
        $healthStatus = Invoke-RestMethod -Uri "http://127.0.0.1:$apiPort/health" -TimeoutSec 5
        if ($healthStatus.status -ne "ok" -or $healthStatus.database -ne "online") {
            throw "Unexpected health response."
        }
        Write-Host "[ok] API and PostgreSQL are online." -ForegroundColor Green

        $runtime = Invoke-RestMethod -Uri "http://127.0.0.1:$apiPort/api/v1/settings/runtime" -TimeoutSec 5
        $model = $runtime.components | Where-Object { $_.key -eq "model" } | Select-Object -First 1
        if ($model.state -eq "ready") {
            Write-Host "[ok] Analysis model credentials are configured." -ForegroundColor Green
        } else {
            Write-Host "[info] Analysis model is not configured; document management and provenance remain available." -ForegroundColor Yellow
        }
        Write-Host "Runtime state: $($runtime.state)"
    } catch {
        throw "The container is healthy but the public API check failed: $($_.Exception.Message)"
    }

    Show-Endpoints
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker CLI was not found. Install or start Docker Desktop first."
}

Push-Location $repoRoot
try {
    Invoke-Docker -Arguments @("compose", "version")
    & docker info --format "{{.ServerVersion}}" 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Docker engine is unavailable. Start Docker Desktop, wait until it is ready, and run this command again."
    }

    switch ($Action) {
        "start" {
            if (-not (Test-Path -LiteralPath $envPath)) {
                Copy-Item -LiteralPath $envExamplePath -Destination $envPath
                Write-Host "Created .env from .env.example; add model keys when needed." -ForegroundColor Yellow
            }

            if ($BuildSandbox) {
                Invoke-Docker -Arguments @("compose", "--profile", "sandbox", "build", "sandbox")
            }

            $arguments = @("compose", "up", "--detach")
            if (-not $NoBuild) {
                $arguments += "--build"
            }
            $arguments += @("postgres", "app")
            Invoke-Docker -Arguments $arguments

            $containerId = (& docker compose ps --quiet app).Trim()
            if (-not $containerId) {
                throw "The app container was not created."
            }

            $deadline = (Get-Date).AddMinutes(2)
            do {
                $health = (& docker inspect $containerId --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}").Trim()
                if ($health -eq "healthy") {
                    Write-Host "ReproLab is healthy." -ForegroundColor Green
                    Show-Endpoints
                    break
                }
                if ($health -eq "unhealthy" -or (Get-Date) -ge $deadline) {
                    & docker compose logs --tail 80 app postgres
                    throw "ReproLab did not become healthy (state=$health)."
                }
                Start-Sleep -Seconds 2
            } while ($true)
        }
        "stop" {
            Invoke-Docker -Arguments @("compose", "down")
            Write-Host "Services stopped. Named data volumes were retained." -ForegroundColor Green
        }
        "status" {
            Invoke-Docker -Arguments @("compose", "ps", "--all")
            Show-Endpoints
        }
        "logs" {
            $arguments = @("compose", "logs", "--tail", "$Tail")
            if ($Follow) {
                $arguments += "--follow"
            }
            $arguments += @("app", "postgres")
            Invoke-Docker -Arguments $arguments
        }
        "doctor" {
            Invoke-Docker -Arguments @("compose", "config", "--quiet")
            Show-DoctorReport
            Write-Host "ReproLab diagnostics passed." -ForegroundColor Green
        }
    }
}
finally {
    Pop-Location
}
