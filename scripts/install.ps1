# install.ps1 — Install/Restore OpenCode Custom System from OpenCode-System
# Usage: .\install.ps1 [-Force] [-DryRun]

param(
    [switch]$Force,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$SourceOfTruth = "$env:USERPROFILE\OpenCode-System"
$OpenCodeConfig = "$env:USERPROFILE\.config\opencode"

Write-Host "=== OpenCode Custom System Installer ===" -ForegroundColor Cyan
Write-Host ""

# Verify source of truth exists
if (-not (Test-Path $SourceOfTruth)) {
    Write-Host "ERROR: Source of truth not found at $SourceOfTruth" -ForegroundColor Red
    exit 1
}

Write-Host "Source of Truth: $SourceOfTruth" -ForegroundColor Yellow
Write-Host "OpenCode Config: $OpenCodeConfig" -ForegroundColor Yellow
Write-Host ""

# Step 1: Backup current config
Write-Host "Step 1: Backing up current configuration..." -ForegroundColor Yellow
$timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$backupDir = "$SourceOfTruth\backups\$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

if (Test-Path "$OpenCodeConfig\opencode.jsonc") {
    Copy-Item -Path "$OpenCodeConfig\opencode.jsonc" -Destination "$backupDir\opencode.jsonc" -Force
}
if (Test-Path "$OpenCodeConfig\agents") {
    Copy-Item -Path "$OpenCodeConfig\agents" -Destination "$backupDir\agents" -Recurse -Force
}
if (Test-Path "$OpenCodeConfig\package.json") {
    Copy-Item -Path "$OpenCodeConfig\package.json" -Destination "$backupDir\package.json" -Force
}

Write-Host "  Backup created: $backupDir" -ForegroundColor Green

# Step 2: Copy agents
Write-Host "Step 2: Installing agents..." -ForegroundColor Yellow
$sourceAgents = "$SourceOfTruth\agents"
$destAgents = "$OpenCodeConfig\agents"

if (Test-Path $sourceAgents) {
    if (-not (Test-Path $destAgents)) {
        New-Item -ItemType Directory -Path $destAgents -Force | Out-Null
    }
    
    Get-ChildItem -Path $sourceAgents -File | ForEach-Object {
        $destFile = "$destAgents\$($_.Name)"
        if ($Force -or -not (Test-Path $destFile)) {
            if (-not $DryRun) {
                Copy-Item -Path $_.FullName -Destination $destFile -Force
            }
            Write-Host "  Installed: $($_.Name)" -ForegroundColor Green
        } else {
            Write-Host "  Skipped (exists): $($_.Name)" -ForegroundColor Gray
        }
    }
}

# Step 3: Copy config
Write-Host "Step 3: Installing configuration..." -ForegroundColor Yellow
$sourceConfig = "$SourceOfTruth\config\opencode.jsonc"
$destConfig = "$OpenCodeConfig\opencode.jsonc"

if (Test-Path $sourceConfig) {
    if ($Force -or -not (Test-Path $destConfig)) {
        if (-not $DryRun) {
            Copy-Item -Path $sourceConfig -Destination $destConfig -Force
        }
        Write-Host "  Installed: opencode.jsonc" -ForegroundColor Green
    } else {
        Write-Host "  Skipped (exists): opencode.jsonc" -ForegroundColor Gray
        Write-Host "  Use -Force to overwrite" -ForegroundColor Yellow
    }
}

# Step 4: Verify installation
Write-Host "Step 4: Verifying installation..." -ForegroundColor Yellow

$agents = @("workspace", "commander", "plan", "build", "reviewer")
$allPassed = $true

foreach ($agent in $agents) {
    $agentFile = "$destAgents\$agent.md"
    if (Test-Path $agentFile) {
        Write-Host "  [PASS] $agent agent" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] $agent agent not found" -ForegroundColor Red
        $allPassed = $false
    }
}

if (Test-Path $destConfig) {
    Write-Host "  [PASS] Configuration file" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] Configuration file not found" -ForegroundColor Red
    $allPassed = $false
}

Write-Host ""
if ($allPassed) {
    Write-Host "=== Installation Complete ===" -ForegroundColor Green
} else {
    Write-Host "=== Installation Incomplete (some components missing) ===" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Run verify.ps1 to check system status" -ForegroundColor Cyan
