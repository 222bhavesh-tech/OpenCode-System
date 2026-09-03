# backup.ps1 — Backup OpenCode Custom System
# Creates timestamped backup of current OpenCode configuration
# Usage: .\backup.ps1 [-Description "message"]

param(
    [string]$Description = ""
)

$ErrorActionPreference = "Stop"
$SourceOfTruth = "$env:USERPROFILE\OpenCode-System"
$OpenCodeConfig = "$env:USERPROFILE\.config\opencode"

Write-Host "=== OpenCode Custom System Backup ===" -ForegroundColor Cyan
Write-Host ""

# Create backup directory
$timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$backupDir = "$SourceOfTruth\backups\$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

Write-Host "Backup directory: $backupDir" -ForegroundColor Yellow
Write-Host ""

# Backup metadata
$metadata = @{
    timestamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    description = $Description
    opencode_version = ""
    agents = @()
    mcp_count = 0
    skills_count = 0
    plugins = @()
}

# Get OpenCode version
try {
    $metadata.opencode_version = & opencode --version 2>&1
} catch {
    $metadata.opencode_version = "unknown"
}

# Backup config
Write-Host "Backing up configuration..." -ForegroundColor Yellow
if (Test-Path "$OpenCodeConfig\opencode.jsonc") {
    Copy-Item -Path "$OpenCodeConfig\opencode.jsonc" -Destination "$backupDir\opencode.jsonc" -Force
    Write-Host "  [OK] opencode.jsonc" -ForegroundColor Green
}

# Backup agents
Write-Host "Backing up agents..." -ForegroundColor Yellow
if (Test-Path "$OpenCodeConfig\agents") {
    Copy-Item -Path "$OpenCodeConfig\agents" -Destination "$backupDir\agents" -Recurse -Force
    $agentFiles = Get-ChildItem -Path "$OpenCodeConfig\agents" -Filter "*.md" -File
    $metadata.agents = $agentFiles | ForEach-Object { $_.Name -replace "\.md$", "" }
    Write-Host "  [OK] $($agentFiles.Count) agents" -ForegroundColor Green
}

# Backup package.json
Write-Host "Backing up package.json..." -ForegroundColor Yellow
if (Test-Path "$OpenCodeConfig\package.json") {
    Copy-Item -Path "$OpenCodeConfig\package.json" -Destination "$backupDir\package.json" -Force
    Write-Host "  [OK] package.json" -ForegroundColor Green
}

# Backup AGENTS.md
Write-Host "Backing up AGENTS.md..." -ForegroundColor Yellow
$agentsMdPaths = @(
    "$env:USERPROFILE\Documents\Default Project\AGENTS.md",
    "$OpenCodeConfig\AGENTS.md"
)
foreach ($path in $agentsMdPaths) {
    if (Test-Path $path) {
        Copy-Item -Path $path -Destination "$backupDir\AGENTS.md" -Force
        Write-Host "  [OK] AGENTS.md" -ForegroundColor Green
        break
    }
}

# Save metadata
$metadata | ConvertTo-Json -Depth 5 | Set-Content -Path "$backupDir\metadata.json"

Write-Host ""
Write-Host "=== Backup Complete ===" -ForegroundColor Green
Write-Host "Backup saved to: $backupDir" -ForegroundColor Cyan
Write-Host ""
Write-Host "Contents:" -ForegroundColor Yellow
Get-ChildItem -Path $backupDir -Recurse | ForEach-Object {
    Write-Host "  $($_.FullName -replace [regex]::Escape($backupDir), '')" -ForegroundColor Gray
}
