# repair.ps1 — Repair OpenCode Custom System
# Detects missing/changed configuration and restores from OpenCode-System
# Usage: .\repair.ps1 [-DryRun]

param(
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$SourceOfTruth = "$env:USERPROFILE\OpenCode-System"
$OpenCodeConfig = "$env:USERPROFILE\.config\opencode"

Write-Host "=== OpenCode Custom System Repair ===" -ForegroundColor Cyan
Write-Host ""

# Verify source of truth exists
if (-not (Test-Path $SourceOfTruth)) {
    Write-Host "ERROR: Source of truth not found at $SourceOfTruth" -ForegroundColor Red
    exit 1
}

Write-Host "Source of Truth: $SourceOfTruth" -ForegroundColor Yellow
Write-Host "OpenCode Config: $OpenCodeConfig" -ForegroundColor Yellow
Write-Host ""

# Detect OpenCode version
Write-Host "Detecting OpenCode version..." -ForegroundColor Yellow
try {
    $version = & opencode --version 2>&1
    Write-Host "  OpenCode version: $version" -ForegroundColor Green
} catch {
    Write-Host "  WARNING: Could not detect OpenCode version" -ForegroundColor Yellow
}

# Step 1: Check agents
Write-Host "Step 1: Checking agents..." -ForegroundColor Yellow
$requiredAgents = @("workspace.md", "commander.md", "planner.md", "build.md", "reviewer.md")
$sourceAgents = "$SourceOfTruth\agents"
$destAgents = "$OpenCodeConfig\agents"

$repairCount = 0

foreach ($agent in $requiredAgents) {
    $sourceFile = "$sourceAgents\$agent"
    $destFile = "$destAgents\$agent"
    $agentName = $agent -replace "\.md$", ""
    
    if (-not (Test-Path $sourceFile)) {
        Write-Host "  [SKIP] $agentName — not in source of truth" -ForegroundColor Gray
        continue
    }
    
    if (-not (Test-Path $destFile)) {
        Write-Host "  [MISSING] $agentName — needs install" -ForegroundColor Yellow
        if (-not $DryRun) {
            if (-not (Test-Path $destAgents)) {
                New-Item -ItemType Directory -Path $destAgents -Force | Out-Null
            }
            Copy-Item -Path $sourceFile -Destination $destFile -Force
            Write-Host "  [FIXED] $agentName installed" -ForegroundColor Green
        }
        $repairCount++
    } else {
        # Compare content
        $sourceHash = (Get-FileHash $sourceFile -Algorithm MD5).Hash
        $destHash = (Get-FileHash $destFile -Algorithm MD5).Hash
        
        if ($sourceHash -ne $destHash) {
            Write-Host "  [CHANGED] $agentName — content differs" -ForegroundColor Yellow
            if (-not $DryRun) {
                Copy-Item -Path $sourceFile -Destination $destFile -Force
                Write-Host "  [FIXED] $agentName restored from source" -ForegroundColor Green
            }
            $repairCount++
        } else {
            Write-Host "  [OK] $agentName" -ForegroundColor Green
        }
    }
}

# Step 2: Check config
Write-Host "Step 2: Checking configuration..." -ForegroundColor Yellow
$sourceConfig = "$SourceOfTruth\config\opencode.jsonc"
$destConfig = "$OpenCodeConfig\opencode.jsonc"

if (Test-Path $sourceConfig) {
    if (-not (Test-Path $destConfig)) {
        Write-Host "  [MISSING] opencode.jsonc — needs install" -ForegroundColor Yellow
        if (-not $DryRun) {
            Copy-Item -Path $sourceConfig -Destination $destConfig -Force
            Write-Host "  [FIXED] opencode.jsonc installed" -ForegroundColor Green
        }
        $repairCount++
    } else {
        # Rule 26: Preserve current model/provider settings
        $currentConfig = Get-Content $destConfig -Raw | ConvertFrom-Json
        $currentModel = $currentConfig.model
        $currentSmallModel = $currentConfig.small_model
        
        # Check for hard-coded models in source (should not exist per Rule 19)
        $sourceConfigContent = Get-Content $sourceConfig -Raw | ConvertFrom-Json
        $sourceHasModel = $false
        if ($sourceConfigContent.model) {
            Write-Host "  [WARN] Source config has hard-coded model (Rule 19 violation)" -ForegroundColor Yellow
            $sourceHasModel = $true
        }
        
        # Restore agents, MCPs, skills, plugins but preserve model settings
        $sourceConfigContent.agent = $currentConfig.agent
        $sourceConfigContent.mcp = $currentConfig.mcp
        $sourceConfigContent.skills = $currentConfig.skills
        $sourceConfigContent.permission = $currentConfig.permission
        
        # Only restore if agents/MCPs differ
        $agentsDiffer = ($currentConfig.agent | ConvertTo-Json) -ne ($sourceConfigContent.agent | ConvertTo-Json)
        $mcpDiffer = ($currentConfig.mcp | ConvertTo-Json) -ne ($sourceConfigContent.mcp | ConvertTo-Json)
        
        if ($agentsDiffer -or $mcpDiffer) {
            Write-Host "  [CHANGED] opencode.jsonc — agents/MCPs differ" -ForegroundColor Yellow
            if (-not $DryRun) {
                # Merge: keep model settings, restore everything else
                $mergedConfig = $currentConfig
                $mergedConfig.agent = $sourceConfigContent.agent
                $mergedConfig.mcp = $sourceConfigContent.mcp
                $mergedConfig | ConvertTo-Json -Depth 10 | Set-Content -Path $destConfig -Force
                Write-Host "  [FIXED] opencode.jsonc merged (model preserved)" -ForegroundColor Green
            }
            $repairCount++
        } else {
            Write-Host "  [OK] opencode.jsonc" -ForegroundColor Green
        }
    }
}

# Step 3: Check for duplicates
Write-Host "Step 3: Checking for duplicate agents..." -ForegroundColor Yellow
if (Test-Path $destAgents) {
    $agentFiles = Get-ChildItem -Path $destAgents -Filter "*.md" -File
    $names = $agentFiles | ForEach-Object { $_.Name -replace "\.md$", "" }
    $duplicates = $names | Group-Object | Where-Object { $_.Count -gt 1 }
    
    if ($duplicates) {
        Write-Host "  [WARN] Duplicate agents found:" -ForegroundColor Yellow
        $duplicates | ForEach-Object {
            Write-Host "    - $($_.Name) ($($_.Count) copies)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  [OK] No duplicates" -ForegroundColor Green
    }
}

# Summary
Write-Host ""
Write-Host "=== Repair Summary ===" -ForegroundColor Cyan
if ($repairCount -eq 0) {
    Write-Host "No repairs needed — system is healthy" -ForegroundColor Green
} else {
    Write-Host "$repairCount items repaired" -ForegroundColor Yellow
    if ($DryRun) {
        Write-Host "Run without -DryRun to apply repairs" -ForegroundColor Cyan
    }
}

Write-Host ""
Write-Host "Run verify.ps1 to check system status" -ForegroundColor Cyan
