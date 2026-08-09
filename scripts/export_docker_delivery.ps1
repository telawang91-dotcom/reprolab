param(
    [string]$OutputDirectory = ".\deliverables\docker\current",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$resolvedOutput = [System.IO.Path]::GetFullPath(
    (Join-Path $projectRoot $OutputDirectory)
)
$archivePath = Join-Path $resolvedOutput "reprolab-docker-images.tar"
$checksumPath = "$archivePath.sha256"

New-Item -ItemType Directory -Force -Path $resolvedOutput | Out-Null

Push-Location $projectRoot
try {
    if (-not $SkipBuild) {
        docker compose build app
        if ($LASTEXITCODE -ne 0) {
            throw "ReproLab application image build failed."
        }
    }

    docker image inspect reprolab:latest | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Missing reprolab:latest. Build the application image first."
    }

    docker image inspect pgvector/pgvector:0.7.4-pg16 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        docker pull pgvector/pgvector:0.7.4-pg16
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to obtain the pgvector image."
        }
    }

    docker save `
        --output $archivePath `
        reprolab:latest `
        pgvector/pgvector:0.7.4-pg16
    if ($LASTEXITCODE -ne 0) {
        throw "Docker image export failed."
    }

    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
    "$hash  reprolab-docker-images.tar" |
        Set-Content -Encoding ascii -NoNewline -LiteralPath $checksumPath

    Copy-Item -Force -LiteralPath (Join-Path $projectRoot "docker-compose.yml") -Destination $resolvedOutput
    Copy-Item -Force -LiteralPath (Join-Path $projectRoot ".env.example") -Destination $resolvedOutput
    Copy-Item -Force -LiteralPath (Join-Path $projectRoot "docs\10-DOCKER-DELIVERY.md") `
        -Destination (Join-Path $resolvedOutput "DOCKER-DELIVERY.md")

    Write-Host "Docker delivery archive: $archivePath"
    Write-Host "SHA-256: $hash"
}
finally {
    Pop-Location
}
