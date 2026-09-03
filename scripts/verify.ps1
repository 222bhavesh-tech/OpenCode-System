# verify.ps1 — Verify OpenCode Custom System
# Checks all components are present and correctly configured
# Usage: .\verify.ps1 [-Detailed]

param(
    [switch]$Detailed
)

$ErrorActionPreference = "Stop"
$SourceOfTruth = "$env:USERPROFILE\OpenCode-System"
$OpenCodeConfig = "$env:USERPROFILE\.config\opencode"

Write-Host "=== OpenCode Custom System Verification ===" -ForegroundColor Cyan
Write-Host ""

$passCount = 0
$failCount = 0
$warnCount = 0

function Test-Component {
    param(
        [string]$Name,
        [scriptblock]$Test,
        [string]$PassMsg = "PASS",
        [string]$FailMsg = "FAIL"
    )
    
    $result = & $Test
    if ($result) {
        Write-Host "  [$PassMsg] $Name" -ForegroundColor Green
        $script:passCount++
    } else {
        Write-Host "  [$FailMsg] $Name" -ForegroundColor Red
        $script:failCount++
    }
    return $result
}

function Test-Warn {
    param(
        [string]$Name,
        [scriptblock]$Test
    )
    
    $result = & $Test
    if ($result) {
        Write-Host "  [WARN] $Name" -ForegroundColor Yellow
        $script:warnCount++
    }
    return $result
}

# Source of Truth
Write-Host "Source of Truth:" -ForegroundColor Yellow
Test-Component "OpenCode-System directory exists" { Test-Path $SourceOfTruth }
Test-Component "agents/ directory exists" { Test-Path "$SourceOfTruth\agents" }
Test-Component "config/ directory exists" { Test-Path "$SourceOfTruth\config" }
Test-Component "mcp/ directory exists" { Test-Path "$SourceOfTruth\mcp" }
Test-Component "plugins/ directory exists" { Test-Path "$SourceOfTruth\plugins" }
Test-Component "scripts/ directory exists" { Test-Path "$SourceOfTruth\scripts" }
Test-Component "backups/ directory exists" { Test-Path "$SourceOfTruth\backups" }

Write-Host ""

# Five Primary Agents
Write-Host "Five Primary Agents:" -ForegroundColor Yellow
$agents = @("workspace", "commander", "plan", "build", "reviewer")
$configPath = "$OpenCodeConfig\opencode.jsonc"
$configAgents = @()
if (Test-Path $configPath) {
    $config = Get-Content $configPath -Raw | ConvertFrom-Json
    $configAgents = $config.agent.PSObject.Properties.Name
}

foreach ($agent in $agents) {
    # Check in source of truth (markdown file)
    $sourceExists = Test-Path "$SourceOfTruth\agents\$agent.md"
    # Check in OpenCode config directory (markdown file)
    $configExists = Test-Path "$OpenCodeConfig\agents\$agent.md"
    # Check in opencode.jsonc config
    $inConfig = $agent -in $configAgents
    
    if ($sourceExists -and ($configExists -or $inConfig)) {
        Write-Host "  [PASS] $agent (source + installed)" -ForegroundColor Green
        $passCount++
    } elseif ($sourceExists -or $inConfig) {
        Write-Host "  [WARN] $agent (source only, not fully installed)" -ForegroundColor Yellow
        $warnCount++
    } elseif ($configExists) {
        Write-Host "  [WARN] $agent (installed only, not in source)" -ForegroundColor Yellow
        $warnCount++
    } else {
        Write-Host "  [FAIL] $agent (missing everywhere)" -ForegroundColor Red
        $failCount++
    }
}

Write-Host ""

# Configuration
Write-Host "Configuration:" -ForegroundColor Yellow
Test-Component "opencode.jsonc exists in source" { Test-Path "$SourceOfTruth\config\opencode.jsonc" }
Test-Component "opencode.jsonc exists in OpenCode" { Test-Path "$OpenCodeConfig\opencode.jsonc" }

# Check for 5-mode config
if (Test-Path "$OpenCodeConfig\opencode.jsonc") {
    $config = Get-Content "$OpenCodeConfig\opencode.jsonc" -Raw | ConvertFrom-Json
    $requiredAgents = @("workspace", "commander", "plan", "build", "reviewer")
    $configAgents = $config.agent.PSObject.Properties.Name
    
    $allPresent = $true
    foreach ($agent in $requiredAgents) {
        if ($agent -notin $configAgents) {
            $allPresent = $false
            break
        }
    }
    
    Test-Component "All 5 modes defined in config" { $allPresent }
}

Write-Host ""

# Model & Provider (Rule 27)
Write-Host "Model & Provider:" -ForegroundColor Yellow
Write-Host "  OpenCode Version: $(try { & opencode --version 2>&1 } catch { 'unknown' })" -ForegroundColor Gray

if (Test-Path "$OpenCodeConfig\opencode.jsonc") {
    $config = Get-Content "$OpenCodeConfig\opencode.jsonc" -Raw | ConvertFrom-Json
    
    # Check for hard-coded model (should NOT exist per Rule 19)
    $hasHardcodedModel = $false
    if ($config.model) {
        Write-Host "  [WARN] Hard-coded model found at top level: $($config.model)" -ForegroundColor Yellow
        Write-Host "         Rule 19: Must NOT hard-code models. Use OpenCode native selection." -ForegroundColor Yellow
        $hasHardcodedModel = $true
        $warnCount++
    }
    
    # Check agent-level hard-coded models
    foreach ($agentProp in $config.agent.PSObject.Properties) {
        if ($agentProp.Value.model) {
            Write-Host "  [WARN] Hard-coded model in agent '$($agentProp.Name)': $($agentProp.Value.model)" -ForegroundColor Yellow
            $hasHardcodedModel = $true
            $warnCount++
        }
    }
    
    if (-not $hasHardcodedModel) {
        Write-Host "  [PASS] No hard-coded models (inherits OpenCode selection)" -ForegroundColor Green
        $passCount++
    }
    
    Write-Host "  Model Source: OpenCode native configuration" -ForegroundColor Gray
} else {
    Write-Host "  [WARN] Cannot read config for model verification" -ForegroundColor Yellow
}

Write-Host ""

# Skills
Write-Host "Skills:" -ForegroundColor Yellow
Test-Component "Skills manifest exists" { Test-Path "$SourceOfTruth\skills\manifest.json" }
Test-Component "Skills directory exists" { Test-Path "$OpenCodeConfig\skills" }

if (Test-Path "$OpenCodeConfig\skills") {
    $skillCount = (Get-ChildItem -Path "$OpenCodeConfig\skills" -Directory).Count
    Write-Host "  [INFO] $skillCount skills installed" -ForegroundColor Gray
}

Write-Host ""

# MCPs
Write-Host "MCPs:" -ForegroundColor Yellow
Test-Component "MCP config exists in source" { Test-Path "$SourceOfTruth\mcp\mcp.jsonc" }

if (Test-Path "$OpenCodeConfig\opencode.jsonc") {
    $config = Get-Content "$OpenCodeConfig\opencode.jsonc" -Raw | ConvertFrom-Json
    $enabledMCPs = $config.mcp.PSObject.Properties | Where-Object { $_.Value.enabled -eq $true }
    Write-Host "  [INFO] $($enabledMCPs.Count) MCPs enabled" -ForegroundColor Gray
}

Write-Host ""

# Plugins
Write-Host "Plugins:" -ForegroundColor Yellow
Test-Component "Plugins manifest exists" { Test-Path "$SourceOfTruth\plugins\manifest.json" }

if (Test-Path "$OpenCodeConfig\package.json") {
    $pkg = Get-Content "$OpenCodeConfig\package.json" -Raw | ConvertFrom-Json
    if ($pkg.dependencies) {
        $pluginCount = $pkg.dependencies.PSObject.Properties.Name.Count
        Write-Host "  [INFO] $pluginCount plugins installed" -ForegroundColor Gray
    }
}

Write-Host ""

# Scripts
Write-Host "Scripts:" -ForegroundColor Yellow
$scripts = @("install.ps1", "repair.ps1", "backup.ps1", "verify.ps1", "update.ps1")
foreach ($script in $scripts) {
    Test-Component "$script exists" { Test-Path "$SourceOfTruth\scripts\$script" }
}

Write-Host ""

# Git
Write-Host "Version Control:" -ForegroundColor Yellow
Test-Component "Git repository initialized" { Test-Path "$SourceOfTruth\.git" }

# Duplicates
Write-Host ""
Write-Host "Duplicate Check:" -ForegroundColor Yellow
if (Test-Path "$OpenCodeConfig\agents") {
    $agentFiles = Get-ChildItem -Path "$OpenCodeConfig\agents" -Filter "*.md" -File
    $names = $agentFiles | ForEach-Object { $_.Name -replace "\.md$", "" }
    $duplicates = $names | Group-Object | Where-Object { $_.Count -gt 1 }
    
    if ($duplicates) {
        Write-Host "  [WARN] Duplicate agents found" -ForegroundColor Yellow
        $warnCount++
    } else {
        Write-Host "  [PASS] No duplicates" -ForegroundColor Green
        $passCount++
    }
}

# Summary
Write-Host ""
Write-Host "=== Verification Summary ===" -ForegroundColor Cyan
Write-Host "  PASS: $passCount" -ForegroundColor Green
Write-Host "  FAIL: $failCount" -ForegroundColor Red
Write-Host "  WARN: $warnCount" -ForegroundColor Yellow
Write-Host ""

if ($failCount -eq 0) {
    Write-Host "=== SYSTEM HEALTHY ===" -ForegroundColor Green
} else {
    Write-Host "=== ISSUES DETECTED (run repair.ps1 to fix) ===" -ForegroundColor Red
}
