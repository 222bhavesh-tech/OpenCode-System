# update.ps1 — Handle OpenCode Updates
# Backs up, detects version changes, migrates config if needed, verifies
# Usage: .\update.ps1 [-DryRun] [-SkipBackup]

param(
    [switch]$DryRun,
    [switch]$SkipBackup
)

$ErrorActionPreference = "Stop"
$SourceOfTruth = "$env:USERPROFILE\OpenCode-System"
$OpenCodeConfig = "$env:USERPROFILE\.config\opencode"

Write-Host "=== OpenCode Update Handler ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Backup
if (-not $SkipBackup) {
    Write-Host "Step 1: Creating backup..." -ForegroundColor Yellow
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
    
    # Save version info
    $versionInfo = @{
        timestamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        opencode_version = ""
        action = "pre-update-backup"
    }
    try {
        $versionInfo.opencode_version = & opencode --version 2>&1
    } catch {
        $versionInfo.opencode_version = "unknown"
    }
    $versionInfo | ConvertTo-Json | Set-Content -Path "$backupDir\metadata.json"
    
    Write-Host "  Backup created: $backupDir" -ForegroundColor Green
} else {
    Write-Host "Step 1: Backup skipped" -ForegroundColor Gray
}

Write-Host ""

# Step 2: Detect version
Write-Host "Step 2: Detecting OpenCode version..." -ForegroundColor Yellow
try {
    $newVersion = & opencode --version 2>&1
    Write-Host "  Current version: $newVersion" -ForegroundColor Green
} catch {
    Write-Host "  WARNING: Could not detect version" -ForegroundColor Yellow
}

# Get previous version from last backup
$lastBackup = Get-ChildItem -Path "$SourceOfTruth\backups" -Directory | Sort-Object Name -Descending | Select-Object -First 1
$previousVersion = "unknown"
if ($lastBackup -and (Test-Path "$($lastBackup.FullName)\metadata.json")) {
    $prevMeta = Get-Content "$($lastBackup.FullName)\metadata.json" -Raw | ConvertFrom-Json
    $previousVersion = $prevMeta.opencode_version
}
Write-Host "  Previous version: $previousVersion" -ForegroundColor Gray

Write-Host ""

# Step 3: Detect configuration
Write-Host "Step 3: Detecting configuration schema..." -ForegroundColor Yellow
if (Test-Path "$OpenCodeConfig\opencode.jsonc") {
    try {
        $config = Get-Content "$OpenCodeConfig\opencode.jsonc" -Raw | ConvertFrom-Json
        Write-Host "  Config schema: valid" -ForegroundColor Green
        Write-Host "  Agents defined: $($config.agent.PSObject.Properties.Name.Count)" -ForegroundColor Gray
        Write-Host "  MCPs defined: $($config.mcp.PSObject.Properties.Name.Count)" -ForegroundColor Gray
    } catch {
        Write-Host "  WARNING: Config schema may have changed" -ForegroundColor Yellow
    }
}

Write-Host ""

# Step 4: Check compatibility
Write-Host "Step 4: Checking compatibility..." -ForegroundColor Yellow
$issues = @()

# Check if required agents still exist
$requiredAgents = @("workspace", "commander", "plan", "build", "reviewer")
foreach ($agent in $requiredAgents) {
    $agentFile = "$OpenCodeConfig\agents\$agent.md"
    if (-not (Test-Path $agentFile)) {
        $issues += "Agent missing: $agent"
    }
}

# Check if config has all required agents
if (Test-Path "$OpenCodeConfig\opencode.jsonc") {
    $config = Get-Content "$OpenCodeConfig\opencode.jsonc" -Raw | ConvertFrom-Json
    foreach ($agent in $requiredAgents) {
        if ($agent -notin $config.agent.PSObject.Properties.Name) {
            $issues += "Agent not in config: $agent"
        }
    }
}

if ($issues.Count -eq 0) {
    Write-Host "  [PASS] All components compatible" -ForegroundColor Green
} else {
    Write-Host "  [WARN] Issues detected:" -ForegroundColor Yellow
    $issues | ForEach-Object {
        Write-Host "    - $_" -ForegroundColor Yellow
    }
}

Write-Host ""

# Step 5: Apply custom configuration
Write-Host "Step 5: Applying custom configuration from source of truth..." -ForegroundColor Yellow
if (-not $DryRun) {
    # Restore agents
    $sourceAgents = "$SourceOfTruth\agents"
    $destAgents = "$OpenCodeConfig\agents"
    
    if (Test-Path $sourceAgents) {
        if (-not (Test-Path $destAgents)) {
            New-Item -ItemType Directory -Path $destAgents -Force | Out-Null
        }
        Copy-Item -Path "$sourceAgents\*" -Destination $destAgents -Recurse -Force
        Write-Host "  Agents restored" -ForegroundColor Green
    }
    
    # Restore config
    $sourceConfig = "$SourceOfTruth\config\opencode.jsonc"
    $destConfig = "$OpenCodeConfig\opencode.jsonc"
    
    if (Test-Path $sourceConfig) {
        Copy-Item -Path $sourceConfig -Destination $destConfig -Force
        Write-Host "  Configuration restored" -ForegroundColor Green
    }
} else {
    Write-Host "  [DRY RUN] No changes applied" -ForegroundColor Gray
}

Write-Host ""

# Step 6: Verify
Write-Host "Step 6: Verifying system..." -ForegroundColor Yellow
$verifyScript = "$SourceOfTruth\scripts\verify.ps1"
if (Test-Path $verifyScript) {
    if (-not $DryRun) {
        & $verifyScript
    } else {
        Write-Host "  [DRY RUN] Verification skipped" -ForegroundColor Gray
    }
} else {
    Write-Host "  WARNING: verify.ps1 not found" -ForegroundColor Yellow
}

# Summary
Write-Host ""
Write-Host "=== Update Complete ===" -ForegroundColor Green
Write-Host "OpenCode version: $newVersion" -ForegroundColor Cyan
Write-Host "Source of truth: $SourceOfTruth" -ForegroundColor Cyan
Write-Host ""
Write-Host "Run verify.ps1 to check system status" -ForegroundColor Cyan
