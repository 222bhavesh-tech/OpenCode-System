#!/usr/bin/env node
import path from 'node:path';
import { ControlPlane, ControlPlaneError } from './control-plane.mjs';

const [command, ...args] = process.argv.slice(2);
const project = path.resolve(readFlag('--project') || process.cwd());
const plane = new ControlPlane(project);

// ─── Async commands (require await) ──────────────────────────────────
const ASYNC_COMMANDS = new Set(['run', 'step', 'schedule', 'loop', 'optimize']);

async function main() {
  try {
    let output;
    switch (command) {
      // ── State commands (sync) ──
      case 'init': output = plane.initialize({ goal: readFlag('--goal') || 'Untitled mission', mode: readFlag('--mode') || 'ASSISTED' }); break;
      case 'add-task': output = plane.addTask(JSON.parse(readFlag('--json', '{}'))); break;
      case 'ready': output = plane.readyTasks(); break;
      case 'start': output = plane.startTask(args[0], readFlag('--agent') || 'commander'); break;
      case 'evidence': output = plane.recordEvidence(args[0], JSON.parse(readFlag('--json', '{}'))); break;
      case 'complete': output = plane.completeTask(args[0], JSON.parse(readFlag('--json', '{}'))); break;
      case 'fail': output = plane.failTask(args[0], JSON.parse(readFlag('--json', '{}'))); break;
      case 'checkpoint': output = plane.checkpoint(readFlag('--summary') || ''); break;
      case 'status': output = plane.status(); break;

      // ── Execution commands (async) ──
      case 'run': {
        const { WorkerAdapter } = await import('./worker.mjs');
        const worker = new WorkerAdapter(plane, { timeout: Number(readFlag('--timeout', '300000')) });
        output = await worker.execute(args[0], {
          kind: readFlag('--kind'),
          command: readFlag('--command'),
          timeout: Number(readFlag('--timeout', '300000')),
        });
        break;
      }
      case 'step': {
        const { Scheduler } = await import('./scheduler.mjs');
        const scheduler = new Scheduler(plane, { stopOnFail: true });
        output = await scheduler.step();
        break;
      }
      case 'schedule': {
        const { Scheduler } = await import('./scheduler.mjs');
        const scheduler = new Scheduler(plane, {
          maxIterations: Number(readFlag('--max', '100')),
          taskTimeoutMs: Number(readFlag('--timeout', '300000')),
          stopOnFail: readFlag('--stop-on-fail') !== 'false',
        });
        scheduler.on('scheduler:start', (e) => console.error(`[scheduler] start: ${JSON.stringify(e)}`));
        scheduler.on('scheduler:dispatch', (e) => console.error(`[scheduler] dispatch: ${e.taskId} (iter ${e.iteration})`));
        scheduler.on('scheduler:result', (e) => console.error(`[scheduler] result: ${e.taskId} ${e.success ? 'PASS' : 'FAIL'}`));
        scheduler.on('scheduler:complete', (e) => console.error(`[scheduler] complete: ${e.reason}`));
        scheduler.on('scheduler:idle', (e) => console.error(`[scheduler] idle: no ready tasks (${e.status})`));
        scheduler.on('scheduler:stop', (e) => console.error(`[scheduler] stop: ${e.reason}`));
        output = await scheduler.run();
        break;
      }

      // ── Loop Operator (agent-kit integration) ──
      case 'loop': {
        const { LoopOperator } = await import('./loop-operator.mjs');
        const loop = new LoopOperator(plane, {
          maxIterations: Number(readFlag('--max', '100')),
          taskTimeoutMs: Number(readFlag('--timeout', '300000')),
          stallThresholdMs: Number(readFlag('--stall', '60000')),
          maxRetriesPerTask: Number(readFlag('--retries', '3')),
          maxFailures: Number(readFlag('--max-failures', '10')),
        });
        loop.on('loop:start', (e) => console.error(`[loop] start: ${JSON.stringify(e)}`));
        loop.on('loop:iteration', (e) => console.error(`[loop] iteration: ${e.taskId}`));
        loop.on('loop:task-done', (e) => console.error(`[loop] done: ${e.taskId} (${e.duration}ms)`));
        loop.on('loop:task-fail', (e) => console.error(`[loop] fail: ${e.taskId} (attempt ${e.failureCount})`));
        loop.on('loop:recovery', (e) => console.error(`[loop] recovery: ${e.strategy} on ${e.taskId}`));
        loop.on('loop:complete', (e) => console.error(`[loop] complete: ${e.iterations} iterations, ${e.succeeded} succeeded, ${e.failed} failed`));
        output = await loop.run();
        break;
      }

      // ── Harness Optimizer (agent-kit integration) ──
      case 'optimize': {
        const { HarnessOptimizer } = await import('./harness-optimizer.mjs');
        const optimizer = new HarnessOptimizer(project);
        output = await optimizer.analyze();
        break;
      }

      // ── Memory commands (agent-kit integration) ──
      case 'memory': {
        const { Memory } = await import('./memory.mjs');
        const mem = new Memory(project);
        const subcommand = args[0];
        switch (subcommand) {
          case 'store':
            output = mem.store(
              readFlag('--category') || 'insight',
              readFlag('--content') || '',
              JSON.parse(readFlag('--meta', '{}'))
            );
            break;
          case 'search':
            output = mem.search(readFlag('--query') || '', {
              category: readFlag('--category'),
              limit: Number(readFlag('--limit', '20')),
            });
            break;
          case 'recent':
            output = mem.recent(readFlag('--category'), Number(readFlag('--limit', '20')));
            break;
          case 'stats':
            output = mem.stats();
            break;
          case 'markdown':
            output = mem.toMarkdown();
            break;
          case 'clear':
            mem.clear();
            output = { cleared: true };
            break;
          default:
            output = {
              usage: 'memory store|search|recent|stats|markdown|clear [--project PATH]',
              subcommands: {
                store: 'memory store --category <cat> --content <text> [--meta <json>]',
                search: 'memory search --query <text> [--category <cat>] [--limit N]',
                recent: 'memory recent [--category <cat>] [--limit N]',
                stats: 'memory stats',
                markdown: 'memory markdown',
                clear: 'memory clear',
              },
            };
        }
        break;
      }

      // ── Hooks commands (agent-kit integration) ──
      case 'hooks': {
        const { HookRegistry, installDefaultHooks } = await import('./hooks.mjs');
        const registry = new HookRegistry(project);
        const subcommand = args[0];
        switch (subcommand) {
          case 'install':
            installDefaultHooks(registry, project);
            output = { installed: true, hooks: registry.list() };
            break;
          case 'list':
            output = registry.list();
            break;
          case 'run': {
            const event = readFlag('--event') || 'session:start';
            const result = await registry.execute(event, JSON.parse(readFlag('--context', '{}')));
            output = result;
            break;
          }
          default:
            output = {
              usage: 'hooks install|list|run [--project PATH]',
              subcommands: {
                install: 'hooks install (registers default hooks)',
                list: 'hooks list (show registered hooks)',
                run: 'hooks run --event <name> [--context <json>]',
              },
            };
        }
        break;
      }

      // ── Visual Dev Loop (agent-kit integration) ──
      case 'vdl': {
        const { VisualDevLoop } = await import('./visual-dev-loop.mjs');
        const url = readFlag('--url') || 'http://localhost:3000';
        const loop = new VisualDevLoop(plane, {
          url,
          buildCommand: readFlag('--build'),
          maxIterations: Number(readFlag('--max', '10')),
          viewportWidth: Number(readFlag('--width', '1280')),
          viewportHeight: Number(readFlag('--height', '720')),
        });
        loop.on('vdl:build', (e) => console.error(`[vdl] build: ${e.command}`));
        loop.on('vdl:iteration', (e) => console.error(`[vdl] iteration: ${e.iteration}`));
        loop.on('vdl:issues-found', (e) => console.error(`[vdl] issues: ${e.count} found`));
        loop.on('vdl:fix-applied', (e) => console.error(`[vdl] fix: iteration ${e.iteration}`));
        loop.on('vdl:pass', (e) => console.error(`[vdl] pass: iteration ${e.iteration}`));
        loop.on('vdl:done', (e) => console.error(`[vdl] done: ${e.iterations} iterations, passed=${e.passed}`));
        output = await loop.run({ checkScript: readFlag('--check'), fixPrompt: readFlag('--fix') });
        break;
      }

      // ── Diagnostics ──
      case 'doctor': output = {
        node: process.version,
        runtime: 'opencode-system-control-plane',
        stateDirectory: path.join(project, '.opencode-system'),
        initialized: (() => { try { plane.load(); return true; } catch { return false; } })(),
        version: '0.3.0',
        modules: ['control-plane', 'worker', 'scheduler', 'cli', 'memory', 'hooks', 'visual-dev-loop', 'loop-operator', 'harness-optimizer'],
        commands: [
          'init', 'add-task', 'ready', 'start', 'evidence', 'complete', 'fail', 'checkpoint', 'status',
          'run', 'step', 'schedule', 'loop', 'optimize', 'memory', 'hooks', 'vdl', 'doctor',
        ],
      }; break;

      default: throw new ControlPlaneError('USAGE',
        'Usage: <command> [--project PATH]\n\n' +
        'State:          init, add-task, ready, start, evidence, complete, fail, checkpoint, status\n' +
        'Execution:      run <taskId>, step, schedule [--max N], loop [--max N]\n' +
        'Memory:         memory store|search|recent|stats|markdown|clear\n' +
        'Hooks:          hooks install|list|run --event <name>\n' +
        'Visual Dev:     vdl --url <URL> [--build <cmd>]\n' +
        'Optimization:   optimize\n' +
        'Diagnostics:    doctor'
      );
    }

    // Output as JSON (or plain text for markdown)
    if (typeof output === 'string') {
      console.log(output);
    } else {
      console.log(JSON.stringify(output, null, 2));
    }
  } catch (error) {
    console.error(JSON.stringify({ error: error.code || 'ERROR', message: error.message }, null, 2));
    process.exitCode = 1;
  }
}

function readFlag(name, fallback) { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1]; }

main();
