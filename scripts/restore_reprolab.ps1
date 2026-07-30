param(
    [Parameter(Mandatory = $true)]
    [string]$BackupPath,
    [string]$DatabaseName = "",
    [string]$StorageTarget = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$backup = [IO.Path]::GetFullPath($BackupPath)
if (-not (Test-Path -LiteralPath $backup -PathType Container)) {
    throw "Backup directory does not exist: $backup"
}
if (Test-Path -LiteralPath (Join-Path $backup "INCOMPLETE")) {
    throw "Backup is incomplete and cannot be restored."
}
$manifestPath = Join-Path $backup "manifest.json"
$dumpPath = Join-Path $backup "postgres.dump"
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf) -or
    -not (Test-Path -LiteralPath $dumpPath -PathType Leaf)) {
    throw "Backup manifest or PostgreSQL dump is missing."
}

$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $manifestPath | ConvertFrom-Json
if ($manifest.format -ne "reprolab-backup-v1") {
    throw "Unsupported backup format."
}
foreach ($entry in $manifest.files) {
    $candidate = [IO.Path]::GetFullPath((Join-Path $backup $entry.path))
    if (-not $candidate.StartsWith($backup + [IO.Path]::DirectorySeparatorChar)) {
        throw "Backup manifest contains a path outside the backup directory."
    }
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        throw "Backup file is missing: $($entry.path)"
    }
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $candidate).Hash.ToLowerInvariant()
    if ($actual -ne $entry.sha256) {
        throw "Backup checksum mismatch: $($entry.path)"
    }
}

if (-not $DatabaseName) {
    $DatabaseName = "reprolab_restore_" + [DateTime]::UtcNow.ToString("yyyyMMdd_HHmmss")
}
if ($DatabaseName -notmatch "^reprolab_restore_[A-Za-z0-9_]+$") {
    throw "Restore database must start with reprolab_restore_ and contain only letters, numbers, and underscores."
}
$resolvedStorage = if ($StorageTarget) {
    [IO.Path]::GetFullPath($StorageTarget)
} else {
    [IO.Path]::GetFullPath((Join-Path $repoRoot "backend\restore-storage\$DatabaseName"))
}
if (Test-Path -LiteralPath $resolvedStorage) {
    throw "Restore storage target already exists: $resolvedStorage"
}

$containerDump = "/tmp/$DatabaseName.dump"
Push-Location $repoRoot
try {
    $existing = docker compose exec -T postgres psql -U reprolab -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DatabaseName'"
    if ($LASTEXITCODE -ne 0) { throw "Could not inspect PostgreSQL restore target." }
    if (($existing | Out-String).Trim() -eq "1") {
        throw "Restore database already exists: $DatabaseName"
    }
    docker compose exec -T postgres createdb -U reprolab $DatabaseName
    if ($LASTEXITCODE -ne 0) { throw "Could not create restore database." }
    docker compose cp $dumpPath "postgres:$containerDump"
    if ($LASTEXITCODE -ne 0) { throw "Could not copy backup into PostgreSQL container." }
    docker compose exec -T postgres pg_restore -U reprolab -d $DatabaseName --no-owner --no-privileges $containerDump
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL restore failed." }

    New-Item -ItemType Directory -Path $resolvedStorage | Out-Null
    $sourceStorage = Join-Path $backup "storage"
    if (Test-Path -LiteralPath $sourceStorage) {
        Get-ChildItem -LiteralPath $sourceStorage -File |
            Copy-Item -Destination $resolvedStorage
    }
} finally {
    Pop-Location
}

Write-Host "Restore completed into new database: $DatabaseName" -ForegroundColor Green
Write-Host "Restored content storage: $resolvedStorage"
Write-Host "Review it before switching DATABASE_URL or STORAGE_DIR." -ForegroundColor Yellow
