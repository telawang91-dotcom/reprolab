param(
    [string]$OutputRoot = ".backups"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$resolvedRoot = if ([IO.Path]::IsPathRooted($OutputRoot)) {
    [IO.Path]::GetFullPath($OutputRoot)
} else {
    [IO.Path]::GetFullPath((Join-Path $repoRoot $OutputRoot))
}
if ($resolvedRoot -eq [IO.Path]::GetFullPath($repoRoot)) {
    throw "Backup output cannot be the repository root."
}

$stamp = [DateTime]::UtcNow.ToString("yyyyMMdd-HHmmss")
$target = Join-Path $resolvedRoot "reprolab-$stamp"
if (Test-Path -LiteralPath $target) {
    throw "Backup target already exists: $target"
}
New-Item -ItemType Directory -Path $target | Out-Null
$incomplete = Join-Path $target "INCOMPLETE"
Set-Content -Encoding UTF8 -LiteralPath $incomplete -Value "Backup is still in progress."

$containerDump = "/tmp/reprolab-$stamp.dump"
$dumpPath = Join-Path $target "postgres.dump"
Push-Location $repoRoot
try {
    docker info --format "{{.ServerVersion}}" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Docker Engine is unavailable." }
    docker compose exec -T postgres pg_dump -U reprolab -d reprolab -Fc -f $containerDump
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL backup failed." }
    docker compose cp "postgres:$containerDump" $dumpPath
    if ($LASTEXITCODE -ne 0) { throw "Could not copy the PostgreSQL dump." }

    $storageTarget = Join-Path $target "storage"
    New-Item -ItemType Directory -Path $storageTarget | Out-Null
    $appContainer = (docker compose ps -q --all app | Select-Object -First 1)
    if ($appContainer) {
        docker cp "${appContainer}:/data/storage/." $storageTarget
        if ($LASTEXITCODE -ne 0) { throw "Could not copy content storage from the application volume." }
    } else {
        $storageSource = Join-Path $repoRoot "backend\storage"
        Get-ChildItem -LiteralPath $storageSource -File |
            Where-Object { $_.Name -ne ".gitkeep" } |
            Copy-Item -Destination $storageTarget
    }

    $targetUri = [Uri]($target.TrimEnd("\") + "\")
    $entries = Get-ChildItem -LiteralPath $target -File -Recurse |
        Where-Object { $_.Name -ne "INCOMPLETE" } |
        ForEach-Object {
            [ordered]@{
                path = [Uri]::UnescapeDataString(
                    $targetUri.MakeRelativeUri([Uri]$_.FullName).ToString()
                )
                size = $_.Length
                sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()
            }
        }
    $manifest = [ordered]@{
        format = "reprolab-backup-v1"
        generated_at = [DateTime]::UtcNow.ToString("o")
        git_commit = (git -C $repoRoot rev-parse HEAD).Trim()
        database = "reprolab"
        files = @($entries)
    }
    $manifest | ConvertTo-Json -Depth 6 |
        Set-Content -Encoding UTF8 -LiteralPath (Join-Path $target "manifest.json")
    Remove-Item -LiteralPath $incomplete
} finally {
    Pop-Location
}

Write-Host "Backup completed: $target" -ForegroundColor Green
