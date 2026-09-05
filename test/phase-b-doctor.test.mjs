import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Doctor } from '../runtime/doctor.mjs';

describe('Doctor Diagnostics', function() {
  let tmpDir, doctor;

  before(function() {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-test-'));
    // Create .opencode-system directory
    fs.mkdirSync(path.join(tmpDir, '.opencode-system'), { recursive: true });
    // Create a basic state file
    fs.writeFileSync(path.join(tmpDir, '.opencode-system', 'state.json'), JSON.stringify({ tasks: { t1: { id: 't1', status: 'COMPLETE' } } }));
    // Create a package.json
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ dependencies: { 'express': '^4.18.0' }, devDependencies: { 'jest': '^29.0.0' } }));
    doctor = new Doctor(tmpDir);
  });

  after(function() { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('should create a doctor instance', function() {
    assert.ok(doctor);
  });

  it('should run all checks', async function() {
    const results = await doctor.runAll();
    assert.ok(Array.isArray(results));
    assert.ok(results.length >= 5);
  });

  it('should check project structure', function() {
    const result = doctor.checkProjectStructure();
    assert.equal(result.pass, true);
    assert.equal(result.name, 'project-structure');
  });

  it('should check state files', function() {
    const result = doctor.checkStateFiles();
    assert.equal(result.pass, true);
    assert.equal(result.name, 'state-files');
  });

  it('should check memory files', function() {
    const result = doctor.checkMemoryFiles();
    assert.equal(result.pass, true);
    assert.equal(result.name, 'memory-files');
  });

  it('should check dependencies', function() {
    const result = doctor.checkDependencies();
    assert.equal(result.pass, true);
    assert.ok(result.message.includes('1 deps'));
  });

  it('should format results', async function() {
    const results = await doctor.runAll();
    const formatted = doctor.format(results);
    assert.ok(formatted.includes('OpenCode System Diagnostics'));
    assert.ok(formatted.includes('Summary:'));
  });
});