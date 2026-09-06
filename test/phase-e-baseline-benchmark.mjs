/**
 * Phase E Baseline Benchmark — Measure actual runtime performance BEFORE optimizations.
 * Runs each core module through realistic workloads and records timing, memory, and throughput.
 */
import { ControlPlane, TASK_STATUS } from '../runtime/control-plane.mjs';
import { StrategyEngine } from '../runtime/strategy-engine.mjs';
import { ExperienceStore } from '../runtime/experience-store.mjs';
import { LearningEngine } from '../runtime/learning-engine.mjs';
import { FailurePredictor } from '../runtime/failure-predictor.mjs';
import { TaskDecomposer } from '../runtime/task-decomposer.mjs';
import { AgentOrchestrator } from '../runtime/agent-orchestrator.mjs';
import { ContextOptimizer } from '../runtime/context-optimizer.mjs';
import { AdaptiveVerification } from '../runtime/adaptive-verification.mjs';
import { MissionMemory } from '../runtime/mission-memory.mjs';
import { TelemetryCollector } from '../runtime/telemetry.mjs';
import { EvaluationSystem } from '../runtime/evaluation-system.mjs';
import { StallDetector } from '../runtime/stall-detector.mjs';
import { OscillationGuard } from '../runtime/oscillation-guard.mjs';
import { MissionEconomics } from '../runtime/mission-economics.mjs';
import { AutonomyGovernor } from '../runtime/autonomy-governor.mjs';
import { DecisionEngine } from '../runtime/decision-engine.mjs';
import { Replanner } from '../runtime/replanner.mjs';
import { FailureStrategy } from '../runtime/failure-strategy.mjs';
import { ContextCheckpoint } from '../runtime/context-checkpoint.mjs';
import { AdaptiveLoop } from '../runtime/adaptive-loop.mjs';
import { StateSnapshot } from '../runtime/state-snapshot.mjs';
import { Dashboard } from '../runtime/dashboard.mjs';
import { WorkerAdapter } from '../runtime/worker.mjs';
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = 'C:/Users/bhavesh jeengar/OpenCode-System';
const STATE_DIR = path.join(PROJECT_ROOT, '.opencode-system');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const RESULTS = [];

function memMB() {
  return Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100;
}

function bench(name, fn, iterations = 1) {
  // Warmup
  for (let i = 0; i < Math.min(5, iterations); i++) fn(i);
  
  const memBefore = memMB();
  const times = [];
  
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    fn(i);
    times.push(performance.now() - t0);
  }
  
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const p99 = times[Math.floor(times.length * 0.99)];
  const avg = times.reduce((s, t) => s + t, 0) / times.length;
  const memAfter = memMB();
  
  const result = {
    name,
    iterations,
    avg: Math.round(avg * 100) / 100,
    median: Math.round(median * 100) / 100,
    p95: Math.round(p95 * 100) / 100,
    p99: Math.round(p99 * 100) / 100,
    totalMs: Math.round(times.reduce((s, t) => s + t, 0)),
    memDelta: Math.round((memAfter - memBefore) * 100) / 100,
  };
  RESULTS.push(result);
  process.stdout.write(`  ${rpad(result.name, 35)} avg=${rpad(result.avg + 'ms', 10)} median=${rpad(result.median + 'ms', 10)} p95=${rpad(result.p95 + 'ms', 10)} p99=${rpad(result.p99 + 'ms', 10)} mem=${result.memDelta}MB\n`);
  return result;
}

function rpad(s, n) { return String(s).padEnd(n); }

// Ensure we have a clean state to work with
function ensureState() {
  if (!fs.existsSync(STATE_FILE)) {
    const cp = new ControlPlane(PROJECT_ROOT);
    cp.initialize({ goal: 'Benchmark baseline', mode: 'AUTONOMOUS' });
  }
}

async function runBenchmarks() {
  console.log('=== PHASE E BASELINE BENCHMARK ===\n');
  ensureState();

  // --- 1. ControlPlane ---
  console.log('[1/20] ControlPlane...');
  bench('ControlPlane.load', () => {
    const cp = new ControlPlane(PROJECT_ROOT);
    cp.load();
  }, 200);
  
  const cp = new ControlPlane(PROJECT_ROOT);
  cp.load();
  
  bench('ControlPlane.addTask', () => {
    const id = 'bench-' + Math.random().toString(36).slice(2);
    cp.addTask({ id, title: 'Benchmark task', type: 'FEATURE', files: ['a.js'], priority: 'MEDIUM' });
  }, 200);
  
  bench('ControlPlane.status', () => cp.status(), 200);
  
  // --- 2. StrategyEngine ---
  console.log('[2/20] StrategyEngine...');
  const se = new StrategyEngine(null);
  const task = { id: 'b1', type: 'BUG_FIX', files: ['a.js'], dependencies: [], risk: 'MEDIUM' };
  bench('StrategyEngine.selectStrategy', () => se.selectStrategy(task), 1000);
  
  // --- 3. ExperienceStore ---
  console.log('[3/20] ExperienceStore...');
  const es = new ExperienceStore(PROJECT_ROOT);
  es.clear();
  bench('ExperienceStore.record', (i) => {
    es.record({ taskType: i % 3 === 0 ? 'BUG_FIX' : 'FEATURE', outcome: i % 5 === 0 ? 'FAILURE' : 'SUCCESS', strategy: 'DIRECT', duration: 100 + i });
  }, 200);
  bench('ExperienceStore.getOutcomes', () => es.getOutcomes({ taskType: 'FEATURE' }), 200);
  bench('ExperienceStore.stats', () => es.stats(), 100);
  es.clear();
  
  // --- 4. LearningEngine ---
  console.log('[4/20] LearningEngine...');
  const es2 = new ExperienceStore(PROJECT_ROOT);
  es2.clear();
  for (let i = 0; i < 50; i++) {
    es2.record({ taskType: 'FEATURE', outcome: i % 4 === 0 ? 'FAILURE' : 'SUCCESS', strategy: i % 2 === 0 ? 'DIRECT' : 'PARALLEL', agentRole: 'BUILD', duration: 100, recoveryUsed: i % 10 === 0 });
  }
  const le = new LearningEngine(es2);
  bench('LearningEngine.analyze', () => le.analyze(), 50);
  es2.clear();
  
  // --- 5. FailurePredictor ---
  console.log('[5/20] FailurePredictor...');
  const fp = new FailurePredictor(null);
  const pt = { id: 'p1', type: 'FEATURE', files: ['a.js', 'b.js'], dependencies: ['d1', 'd2', 'd3'], risk: 'HIGH' };
  const ctx = { budget: { spent: 50, max: 100 }, contextSize: 30000 };
  bench('FailurePredictor.predict', () => fp.predict(pt, ctx), 1000);
  
  // --- 6. TaskDecomposer ---
  console.log('[6/20] TaskDecomposer...');
  const td = new TaskDecomposer(null);
  const complexTask = { id: 'c1', type: 'FEATURE', files: ['a.js', 'b.js', 'c.js'], dependencies: ['d1', 'd2', 'd3'], risk: 'HIGH', description: 'Implement complex feature' };
  bench('TaskDecomposer.decompose', () => td.decompose(complexTask), 500);
  
  // --- 7. AgentOrchestrator ---
  console.log('[7/20] AgentOrchestrator...');
  const ao = new AgentOrchestrator(null);
  for (let i = 0; i < 10; i++) {
    ao.registerAgent({ id: 'agent-' + i, role: i % 3 === 0 ? 'PLANNER' : 'BUILD', capabilities: ['javascript', 'testing'] });
  }
  bench('AgentOrchestrator.assignTask', (i) => {
    ao.assignTask('agent-' + (i % 10), { id: 'task-' + i, type: 'FEATURE', requiredCapabilities: ['javascript'] });
  }, 200);
  
  // --- 8. ContextOptimizer ---
  console.log('[8/20] ContextOptimizer...');
  const co = new ContextOptimizer(null);
  const bigContext = Array.from({ length: 50 }, (_, i) => ({ name: 'section-' + i, content: 'x'.repeat(2000), priority: i % 5 }));
  bench('ContextOptimizer.optimize', () => co.optimize('FEATURE', bigContext), 200);
  
  // --- 9. AdaptiveVerification ---
  console.log('[9/20] AdaptiveVerification...');
  const av = new AdaptiveVerification();
  const vTask = { id: 'v1', type: 'FEATURE', files: ['a.js', 'b.js'], risk: 'HIGH' };
  bench('AdaptiveVerification.selectChecks', () => av.selectChecks(vTask, 'HIGH'), 500);
  
  // --- 10. MissionMemory ---
  console.log('[10/20] MissionMemory...');
  const mm = new MissionMemory(PROJECT_ROOT);
  bench('MissionMemory.save', (i) => {
    mm.save({ id: 'mission-' + i, objective: 'Test', outcome: 'SUCCESS', totalDuration: 1000 });
  }, 100);
  bench('MissionMemory.recall', () => mm.recall(), 100);
  
  // --- 11. TelemetryCollector ---
  console.log('[11/20] TelemetryCollector...');
  const tc = new TelemetryCollector();
  bench('TelemetryCollector.recordMetric', (i) => {
    tc.recordMetric('task.duration', 100 + i, { type: 'FEATURE' });
  }, 500);
  bench('TelemetryCollector.getMetricStats', () => tc.getMetricStats('task.duration'), 100);
  
  // --- 12. EvaluationSystem ---
  console.log('[12/20] EvaluationSystem...');
  const ev = new EvaluationSystem();
  const eTask = { id: 'e1', type: 'FEATURE', files: ['a.js'], evidence: [{ type: 'test', passed: true }] };
  const eResult = { output: 'Test output', duration: 1000, success: true };
  bench('EvaluationSystem.evaluate', () => ev.evaluate(eTask, eResult), 500);
  
  // --- 13. StallDetector ---
  console.log('[13/20] StallDetector...');
  const sd = new StallDetector();
  bench('StallDetector.trackTask', (i) => {
    sd.trackTask('task-' + (i % 5), { status: 'IN_PROGRESS', progress: false });
    sd.getStalledTasks();
  }, 500);
  
  // --- 14. OscillationGuard ---
  console.log('[14/20] OscillationGuard...');
  const og = new OscillationGuard();
  bench('OscillationGuard.recordChange', (i) => {
    og.recordChange('task-' + (i % 3), { from: 'DO', to: i % 2 === 0 ? 'UNDO' : 'DO' });
  }, 500);
  bench('OscillationGuard.isOscillating', () => og.isOscillating('task-0'), 200);
  
  // --- 15. MissionEconomics ---
  console.log('[15/20] MissionEconomics...');
  const me = new MissionEconomics();
  me.startSession('bench');
  bench('MissionEconomics.recordTokens', (i) => {
    me.recordTokens('bench', 100 + i);
  }, 500);
  bench('MissionEconomics.stats', () => me.stats(), 100);
  
  // --- 16. AutonomyGovernor ---
  console.log('[16/20] AutonomyGovernor...');
  const ag = new AutonomyGovernor(null);
  bench('AutonomyGovernor.check', (i) => {
    ag.check({ type: i % 3 === 0 ? 'CREDENTIAL' : 'CODE_WRITE' });
  }, 1000);
  
  // --- 17. DecisionEngine ---
  console.log('[17/20] DecisionEngine...');
  const deCp = new ControlPlane(PROJECT_ROOT);
  deCp.load();
  const de = new DecisionEngine(deCp);
  const dState = deCp.load();
  const pendingTasks = Object.values(dState.tasks).filter(t => t.status === 'PENDING');
  bench('DecisionEngine.decide', () => de.decide({ status: 'IN_PROGRESS', tasks: pendingTasks, completedTasks: 2, totalTasks: pendingTasks.length + 2 }), 500);
  
  // --- 18. Replanner ---
  console.log('[18/20] Replanner...');
  const rpCp = new ControlPlane(PROJECT_ROOT);
  rpCp.load();
  // Add some tasks to the control plane for replanner to work with
  for (let i = 0; i < 5; i++) {
    try { rpCp.addTask({ id: 'rp-task-' + i, title: 'Replanner task ' + i, type: 'FEATURE', files: ['a.js'], dependencies: i > 0 ? ['rp-task-' + (i - 1)] : [] }); } catch(e) {}
  }
  const rp = new Replanner(rpCp);
  bench('Replanner.addTask', () => {
    try { rp.addTask({ id: 'rp-new-' + Math.random().toString(36).slice(2), title: 'New task', type: 'BUG_FIX', files: ['b.js'] }); } catch(e) {}
  }, 100);
  
  // --- 19. ContextCheckpoint ---
  console.log('[19/20] ContextCheckpoint...');
  const cc = new ContextCheckpoint(cp);
  bench('ContextCheckpoint.save', () => cc.save({}), 100);
  bench('ContextCheckpoint.restore', () => cc.restore(), 100);
  
  // --- 20. Full Pipeline ---
  console.log('[20/20] Full pipeline...');
  const fullCp = new ControlPlane(PROJECT_ROOT);
  fullCp.load();
  const fullEs = new ExperienceStore(PROJECT_ROOT);
  const fullSe = new StrategyEngine(fullEs);
  const fullAv = new AdaptiveVerification();
  
  bench('FullPipeline.10tasks', () => {
    for (let i = 0; i < 10; i++) {
      try {
        fullCp.addTask({ id: 'pipe-' + Math.random().toString(36).slice(2), title: 'Pipeline task', type: 'FEATURE', files: ['a.js'], priority: 'MEDIUM' });
      } catch(e) {}
    }
    const state = fullCp.load();
    const pending = Object.values(state.tasks).filter(t => t.status === 'PENDING');
    for (const t of pending) {
      fullSe.selectStrategy(t);
      fullAv.selectChecks(t, 'MEDIUM');
    }
  }, 50);
  
  // --- Summary ---
  console.log('\n');
  console.log('=== BASELINE SUMMARY ===\n');
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad('Module', 38) + pad('Avg (ms)', 12) + pad('Median', 12) + pad('P95', 12) + pad('P99', 12) + 'Mem Δ');
  console.log('-'.repeat(90));
  for (const r of RESULTS) {
    console.log(pad(r.name, 38) + pad(r.avg, 12) + pad(r.median, 12) + pad(r.p95, 12) + pad(r.p99, 12) + r.memDelta + 'MB');
  }
  
  const totalMs = RESULTS.reduce((s, r) => s + r.totalMs, 0);
  const avgDecision = RESULTS.find(r => r.name === 'DecisionEngine.decide')?.avg || 0;
  const avgStrategy = RESULTS.find(r => r.name === 'StrategyEngine.selectStrategy')?.avg || 0;
  const avgRecord = RESULTS.find(r => r.name === 'ExperienceStore.record')?.avg || 0;
  const avgPipeline = RESULTS.find(r => r.name === 'FullPipeline.10tasks')?.avg || 0;
  const avgCheckpoint = RESULTS.find(r => r.name === 'ContextCheckpoint.save')?.avg || 0;
  const avgOptimize = RESULTS.find(r => r.name === 'ContextOptimizer.optimize')?.avg || 0;
  
  console.log('\n=== KEY METRICS ===');
  console.log(`Decision latency: ${avgDecision}ms avg`);
  console.log(`Strategy selection: ${avgStrategy}ms avg`);
  console.log(`Experience recording: ${avgRecord}ms avg`);
  console.log(`Context optimization: ${avgOptimize}ms avg`);
  console.log(`Checkpoint save: ${avgCheckpoint}ms avg`);
  console.log(`Full pipeline (10 tasks): ${avgPipeline}ms avg`);
  console.log(`Total benchmark time: ${Math.round(totalMs)}ms`);
  console.log(`Peak heap: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
  
  fs.writeFileSync(path.join(PROJECT_ROOT, 'test', 'baseline-results.json'), JSON.stringify(RESULTS, null, 2));
  console.log('\nResults saved to test/baseline-results.json');
}

runBenchmarks().catch(console.error);
