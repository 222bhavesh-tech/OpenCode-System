# verify.ps1 â€” Verify OpenCode Custom System
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
Test-Component "MCP registry exists" { Test-Path "$SourceOfTruth\mcp\registry.md" }

if (Test-Path "$OpenCodeConfig\opencode.jsonc") {
    $config = Get-Content "$OpenCodeConfig\opencode.jsonc" -Raw | ConvertFrom-Json
    $enabledMCPs = $config.mcp.PSObject.Properties | Where-Object { $_.Value.enabled -eq $true }
    Write-Host "  [INFO] $($enabledMCPs.Count) MCPs enabled" -ForegroundColor Gray
    
    # MCP categories
    $categories = @{
        "Development" = @("github", "filesystem", "sentry")
        "Browser" = @("playwright", "chrome-devtools")
        "Knowledge" = @("memory", "context7")
        "Web" = @("firecrawl", "fetch", "scrapling")
        "Reasoning" = @("sequential-thinking")
        "CMS" = @("wordpress", "woocommerce", "shopify")
        "Database" = @("dbmcp")
        "Social" = @("chirpie")
    }
    
    foreach ($category in $categories.Keys) {
        $categoryMCPs = $categories[$category]
        $activeCount = 0
        foreach ($mcp in $categoryMCPs) {
            if ($config.mcp.$mcp -and $config.mcp.$mcp.enabled -eq $true) {
                $activeCount++
            }
        }
        Write-Host "  [INFO] $category : $activeCount/$($categoryMCPs.Count) active" -ForegroundColor Gray
    }
    
    # Check for disabled non-free MCPs
    $disabledMCPs = $config.mcp.PSObject.Properties | Where-Object { $_.Value.enabled -eq $false }
    if ($disabledMCPs.Count -gt 0) {
        Write-Host "  [INFO] $($disabledMCPs.Count) MCPs disabled (non-free)" -ForegroundColor Gray
    }
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

# Phase 2 Components
Write-Host ""
Write-Host "Phase 2 Components:" -ForegroundColor Yellow

# NOCTURNE
Test-Component "NOCTURNE agent exists" { Test-Path "$SourceOfTruth\agents\nocturne.md" }
Test-Component "NOCTURNE parser exists" { Test-Path "$SourceOfTruth\agents\nocturne-parser.md" }
Test-Component "NOCTURNE ticket exists" { Test-Path "$SourceOfTruth\agents\nocturne-ticket.md" }
Test-Component "NOCTURNE branch exists" { Test-Path "$SourceOfTruth\agents\nocturne-branch.md" }

# Oh-My-OpenCode
Test-Component "Oh-My-OpenCode exists" { Test-Path "$SourceOfTruth\agents\oh-my-opencode.md" }

# Commander Enhanced
Test-Component "Commander enhanced exists" { Test-Path "$SourceOfTruth\agents\commander-enhanced.md" }

# Swarm
Test-Component "Swarm exists" { Test-Path "$SourceOfTruth\agents\swarm.md" }

# Flow-Next
Test-Component "Flow-Next exists" { Test-Path "$SourceOfTruth\agents\flow-next.md" }

# Forge
Test-Component "Forge exists" { Test-Path "$SourceOfTruth\agents\forge.md" }

# Verification Stack
Test-Component "Verification stack exists" { Test-Path "$SourceOfTruth\agents\verification-stack.md" }

# Ralph
Test-Component "Ralph exists" { Test-Path "$SourceOfTruth\agents\ralph.md" }

# Context Engine
Test-Component "Context engine exists" { Test-Path "$SourceOfTruth\agents\context-engine.md" }

# Model Router
Test-Component "Model router exists" { Test-Path "$SourceOfTruth\agents\model-router.md" }

# Hooks
Test-Component "Hooks system exists" { Test-Path "$SourceOfTruth\agents\hooks.md" }

# Observability
Test-Component "Observability exists" { Test-Path "$SourceOfTruth\agents\observability.md" }

Write-Host ""

# Templates
Write-Host "Templates:" -ForegroundColor Yellow
Test-Component "templates/ directory exists" { Test-Path "$SourceOfTruth\templates" }
Test-Component "mission-brief template exists" { Test-Path "$SourceOfTruth\templates\mission-brief.md" }
Test-Component "task-graph template exists" { Test-Path "$SourceOfTruth\templates\task-graph.md" }
Test-Component "execution-report template exists" { Test-Path "$SourceOfTruth\templates\execution-report.md" }
Test-Component "evidence-gate template exists" { Test-Path "$SourceOfTruth\templates\evidence-gate.md" }
Test-Component "project-state template exists" { Test-Path "$SourceOfTruth\templates\project-state.md" }
Test-Component "swarm-config template exists" { Test-Path "$SourceOfTruth\templates\swarm-config.md" }
Test-Component "context-snapshot template exists" { Test-Path "$SourceOfTruth\templates\context-snapshot.md" }
Test-Component "nocturne-ticket template exists" { Test-Path "$SourceOfTruth\templates\nocturne-ticket.md" }
Test-Component "ralph-state template exists" { Test-Path "$SourceOfTruth\templates\ralph-state.md" }
Test-Component "model-router-config template exists" { Test-Path "$SourceOfTruth\templates\model-router-config.md" }

Write-Host ""

# Commands
Write-Host "Commands:" -ForegroundColor Yellow
Test-Component "commands/ directory exists" { Test-Path "$SourceOfTruth\commands" }
Test-Component "task command exists" { Test-Path "$SourceOfTruth\commands\task.md" }
Test-Component "issue command exists" { Test-Path "$SourceOfTruth\commands\issue.md" }
Test-Component "plan command exists" { Test-Path "$SourceOfTruth\commands\plan.md" }
Test-Component "swarm command exists" { Test-Path "$SourceOfTruth\commands\swarm.md" }
Test-Component "gate command exists" { Test-Path "$SourceOfTruth\commands\gate.md" }
Test-Component "save command exists" { Test-Path "$SourceOfTruth\commands\save.md" }
Test-Component "context command exists" { Test-Path "$SourceOfTruth\commands\context.md" }
Test-Component "model command exists" { Test-Path "$SourceOfTruth\commands\model.md" }

Write-Host ""

# AGENTS.md Phase 2 sections
Write-Host "AGENTS.md:" -ForegroundColor Yellow
$agentsContent = Get-Content "$SourceOfTruth\AGENTS.md" -Raw
$hasPhase2 = $agentsContent -match "PHASE 2: AUTONOMOUS ENGINEERING PLATFORM"
if ($hasPhase2) {
    Write-Host "  [PASS] Phase 2 sections present" -ForegroundColor Green
    $passCount++
} else {
    Write-Host "  [FAIL] Phase 2 sections missing" -ForegroundColor Red
    $failCount++
}

$hasNocturne = $agentsContent -match "NOCTURNE"
if ($hasNocturne) {
    Write-Host "  [PASS] NOCTURNE section present" -ForegroundColor Green
    $passCount++
} else {
    Write-Host "  [FAIL] NOCTURNE section missing" -ForegroundColor Red
    $failCount++
}

$hasSwarm = $agentsContent -match "SWARM"
if ($hasSwarm) {
    Write-Host "  [PASS] SWARM section present" -ForegroundColor Green
    $passCount++
} else {
    Write-Host "  [FAIL] SWARM section missing" -ForegroundColor Red
    $failCount++
}

$hasFlowNext = $agentsContent -match "FLOW-NEXT"
if ($hasFlowNext) {
    Write-Host "  [PASS] FLOW-NEXT section present" -ForegroundColor Green
    $passCount++
} else {
    Write-Host "  [FAIL] FLOW-NEXT section missing" -ForegroundColor Red
    $failCount++
}

$hasForge = $agentsContent -match "FORGE"
if ($hasForge) {
    Write-Host "  [PASS] FORGE section present" -ForegroundColor Green
    $passCount++
} else {
    Write-Host "  [FAIL] FORGE section missing" -ForegroundColor Red
    $failCount++
}

$hasRalph = $agentsContent -match "RALPH"
if ($hasRalph) {
    Write-Host "  [PASS] RALPH section present" -ForegroundColor Green
    $passCount++
} else {
    Write-Host "  [FAIL] RALPH section missing" -ForegroundColor Red
    $failCount++
}

# ── Runtime Files ──
Write-Host ""
Write-Host "Runtime Files:" -ForegroundColor Cyan

$runtimeFiles = @(
    @{ Name = "control-plane.mjs"; Path = "$SourceOfTruth\runtime\control-plane.mjs" },
    @{ Name = "worker.mjs"; Path = "$SourceOfTruth\runtime\worker.mjs" },
    @{ Name = "scheduler.mjs"; Path = "$SourceOfTruth\runtime\scheduler.mjs" },
    @{ Name = "cli.mjs"; Path = "$SourceOfTruth\runtime\cli.mjs" },
    @{ Name = "memory.mjs"; Path = "$SourceOfTruth\runtime\memory.mjs" },
    @{ Name = "hooks.mjs"; Path = "$SourceOfTruth\runtime\hooks.mjs" },
    @{ Name = "visual-dev-loop.mjs"; Path = "$SourceOfTruth\runtime\visual-dev-loop.mjs" },
    @{ Name = "loop-operator.mjs"; Path = "$SourceOfTruth\runtime\loop-operator.mjs" },
    @{ Name = "harness-optimizer.mjs"; Path = "$SourceOfTruth\runtime\harness-optimizer.mjs" }
)

foreach ($file in $runtimeFiles) {
    if (Test-Path $file.Path) {
        Write-Host "  [PASS] $($file.Name) present" -ForegroundColor Green
        $passCount++
    } else {
        Write-Host "  [FAIL] $($file.Name) missing" -ForegroundColor Red
        $failCount++
    }
}

# ── Runtime Exports ──
Write-Host ""
Write-Host "Runtime Exports:" -ForegroundColor Cyan

$cpContent = Get-Content "$SourceOfTruth\runtime\control-plane.mjs" -Raw
if ($cpContent -match "export class ControlPlane") {
    Write-Host "  [PASS] ControlPlane class exported" -ForegroundColor Green
    $passCount++
} else {
    Write-Host "  [FAIL] ControlPlane class not exported" -ForegroundColor Red
    $failCount++
}

$workerContent = Get-Content "$SourceOfTruth\runtime\worker.mjs" -Raw
if ($workerContent -match "export class WorkerAdapter") {
    Write-Host "  [PASS] WorkerAdapter class exported" -ForegroundColor Green
    $passCount++
} else {
    Write-Host "  [FAIL] WorkerAdapter class not exported" -ForegroundColor Red
    $failCount++
}

$schedulerContent = Get-Content "$SourceOfTruth\runtime\scheduler.mjs" -Raw
if ($schedulerContent -match "export class Scheduler") {
    Write-Host "  [PASS] Scheduler class exported" -ForegroundColor Green
    $passCount++
} else {
    Write-Host "  [FAIL] Scheduler class not exported" -ForegroundColor Red
    $failCount++
}

# ── CLI Commands ──
Write-Host ""
Write-Host "CLI Commands:" -ForegroundColor Cyan

$cliContent = Get-Content "$SourceOfTruth\runtime\cli.mjs" -Raw
$cliCommands = @('init', 'add-task', 'ready', 'start', 'evidence', 'complete', 'fail', 'checkpoint', 'status', 'run', 'step', 'schedule', 'loop', 'optimize', 'memory', 'hooks', 'vdl', 'doctor')
$missingCli = @()
foreach ($cmd in $cliCommands) {
    if ($cliContent -match "case '$cmd'") {
        # present
    } else {
        $missingCli += $cmd
    }
}
if ($missingCli.Count -eq 0) {
    Write-Host "  [PASS] All 18 CLI commands present" -ForegroundColor Green
    $passCount++
} else {
    Write-Host "  [FAIL] Missing CLI commands: $($missingCli -join ', ')" -ForegroundColor Red
    $failCount++
}

# ── Tests ──
Write-Host ""
Write-Host "Test Suite:" -ForegroundColor Cyan

$testFile = "$SourceOfTruth\test\control-plane.test.mjs"
if (Test-Path $testFile) {
    Write-Host "  [PASS] test/control-plane.test.mjs present" -ForegroundColor Green
    $passCount++
    
    $testContent = Get-Content $testFile -Raw
    $testCount = ([regex]::Matches($testContent, "test\('")).Count
    Write-Host "  [PASS] $testCount tests defined" -ForegroundColor Green
    $passCount++
} else {
    Write-Host "  [FAIL] test file missing" -ForegroundColor Red
    $failCount++
}

# ── AGENTS.md Runtime Section ──
Write-Host ""
Write-Host "Documentation:" -ForegroundColor Cyan

if ($agentsContent -match "EXECUTABLE RUNTIME") {
    Write-Host "  [PASS] AGENTS.md has EXECUTABLE RUNTIME section" -ForegroundColor Green
    $passCount++
} else {
    Write-Host "  [FAIL] AGENTS.md missing EXECUTABLE RUNTIME section" -ForegroundColor Red
    $failCount++
}

if ($agentsContent -match "ADAPTER CONTRACT") {
    Write-Host "  [PASS] AGENTS.md has ADAPTER CONTRACT section" -ForegroundColor Green
    $passCount++
} else {
    Write-Host "  [FAIL] AGENTS.md missing ADAPTER CONTRACT section" -ForegroundColor Red
    $failCount++
}

# ── Agent-Kit Integration ──
Write-Host ""
Write-Host "Agent-Kit Integration:" -ForegroundColor Cyan

$agentKitFiles = @(
    @{ Name = "memory.mjs"; Path = "$SourceOfTruth\runtime\memory.mjs"; Export = "class Memory" },
    @{ Name = "hooks.mjs"; Path = "$SourceOfTruth\runtime\hooks.mjs"; Export = "class HookRegistry" },
    @{ Name = "visual-dev-loop.mjs"; Path = "$SourceOfTruth\runtime\visual-dev-loop.mjs"; Export = "class VisualDevLoop" },
    @{ Name = "loop-operator.mjs"; Path = "$SourceOfTruth\runtime\loop-operator.mjs"; Export = "class LoopOperator" },
    @{ Name = "harness-optimizer.mjs"; Path = "$SourceOfTruth\runtime\harness-optimizer.mjs"; Export = "class HarnessOptimizer" }
)

foreach ($file in $agentKitFiles) {
    if (Test-Path $file.Path) {
        $content = Get-Content $file.Path -Raw
        if ($content -match "export $($file.Export)") {
            Write-Host "  [PASS] $($file.Name) with $($file.Export) exported" -ForegroundColor Green
            $passCount++
        } else {
            Write-Host "  [WARN] $($file.Name) present but export not found" -ForegroundColor Yellow
            $warnCount++
        }
    } else {
        Write-Host "  [FAIL] $($file.Name) missing" -ForegroundColor Red
        $failCount++
    }
}

if ($agentsContent -match "AGENT-KIT INTEGRATION") {
    Write-Host "  [PASS] AGENTS.md has AGENT-KIT INTEGRATION section" -ForegroundColor Green
    $passCount++
} else {
    Write-Host "  [FAIL] AGENTS.md missing AGENT-KIT INTEGRATION section" -ForegroundColor Red
    $failCount++
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

