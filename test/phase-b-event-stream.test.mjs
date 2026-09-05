import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { EventStream, EVENT_TYPE } from '../runtime/event-stream.mjs';

describe('Event Stream', function() {
  let stream;

  before(function() {
    stream = new EventStream({ maxEvents: 100 });
  });

  it('should create an event stream', function() {
    assert.ok(stream);
  });

  it('should emit and receive events', function() {
    let received = null;
    stream.on('event', (e) => { received = e; });
    stream.emit('MISSION_CREATED', { objective: 'Test' });
    assert.ok(received);
    assert.equal(received.type, 'MISSION_CREATED');
    assert.ok(received.id.startsWith('evt-'));
    assert.ok(received.timestamp);
    assert.equal(received.severity, 'info');
  });

  it('should set correct severity for error events', function() {
    stream.emit('TASK_FAILED', { taskId: 't1' });
    const events = stream.getByType('TASK_FAILED');
    assert.equal(events[0].severity, 'error');
  });

  it('should set correct severity for success events', function() {
    stream.emit('TASK_COMPLETED', { taskId: 't1' });
    const events = stream.getByType('TASK_COMPLETED');
    assert.equal(events[0].severity, 'success');
  });

  it('should set correct severity for warning events', function() {
    stream.emit('WORKER_DEGRADED', { workerId: 'w1' });
    const events = stream.getByType('WORKER_DEGRADED');
    assert.equal(events[0].severity, 'warning');
  });

  it('should subscribe to multiple event types', function() {
    let count = 0;
    const sub = stream.subscribe(['TASK_STARTED', 'TASK_COMPLETED'], () => { count++; });
    stream.emit('TASK_STARTED', { taskId: 't1' });
    stream.emit('TASK_COMPLETED', { taskId: 't1' });
    assert.equal(count, 2);
    stream.unsubscribe(sub);
  });

  it('should get events by type', function() {
    const events = stream.getByType('MISSION_CREATED');
    assert.ok(events.length > 0);
  });

  it('should get recent events', function() {
    const recent = stream.recent(5);
    assert.ok(Array.isArray(recent));
    assert.ok(recent.length <= 5);
  });

  it('should get event statistics', function() {
    const stats = stream.stats();
    assert.ok(stats.total > 0);
    assert.ok(stats.byType);
    assert.ok(stats.bySeverity);
  });

  it('should respect max events', function() {
    const smallStream = new EventStream({ maxEvents: 5 });
    for (let i = 0; i < 10; i++) smallStream.emit('TEST_EVENT', { i: i });
    assert.equal(smallStream.events.length, 5);
  });

  it('should clear events', function() {
    stream.clear();
    assert.equal(stream.events.length, 0);
  });
});