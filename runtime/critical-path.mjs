import { EventEmitter } from 'node:events';

class CriticalPathFinder extends EventEmitter {
  constructor(options) {
    super();
    this.paths = [];
  }

  /**
   * Find critical path through a task graph.
   */
  findCriticalPath(tasks) {
    if (!tasks || tasks.length === 0) return { paths: [], criticalPath: [], estimatedDuration: 0 };
    const graph = this._buildGraph(tasks);
    const allPaths = this._findAllPaths(graph);
    const criticalPath = this._findLongestPath(allPaths);
    const estimatedDuration = criticalPath.reduce((sum, taskId) => {
      const task = tasks.find(t => t.id === taskId);
      return sum + (task ? task.estimatedDuration || 0 : 0);
    }, 0);
    return { paths: allPaths.map(p => ({ path: p, duration: this._pathDuration(p, tasks) })), criticalPath, estimatedDuration, bottleneckCount: this._countBottlenecks(criticalPath, tasks) };
  }

  /**
   * Get tasks on critical path.
   */
  getCriticalTasks(tasks) {
    const result = this.findCriticalPath(tasks);
    return result.criticalPath.map(id => tasks.find(t => t.id === id)).filter(Boolean);
  }

  /**
   * Identify bottlenecks.
   */
  identifyBottlenecks(tasks) {
    const result = this.findCriticalPath(tasks);
    const bottlenecks = [];
    for (const taskId of result.criticalPath) {
      const task = tasks.find(t => t.id === taskId);
      if (task && task.dependencies && task.dependencies.length > 2) {
        bottlenecks.push({ taskId, reason: 'High dependency count: ' + task.dependencies.length });
      }
    }
    return bottlenecks;
  }

  _buildGraph(tasks) {
    const graph = new Map();
    for (const task of tasks) graph.set(task.id, { task, deps: task.dependencies || [] });
    return graph;
  }

  _findAllPaths(graph) {
    const paths = [];
    const roots = [...graph.entries()].filter(([_, node]) => node.deps.length === 0).map(([id]) => id);
    if (roots.length === 0 && graph.size > 0) roots.push([...graph.keys()][0]);
    for (const root of roots) {
      this._dfs(graph, root, [], new Set(), paths);
    }
    return paths;
  }

  _dfs(graph, current, path, visited, allPaths) {
    if (visited.has(current)) { allPaths.push([...path, current]); return; }
    visited.add(current);
    path.push(current);
    const children = [...graph.entries()].filter(([_, node]) => node.deps.includes(current)).map(([id]) => id);
    if (children.length === 0) { allPaths.push([...path]); } else {
      for (const child of children) this._dfs(graph, child, [...path], new Set(visited), allPaths);
    }
    visited.delete(current);
  }

  _findLongestPath(paths) {
    if (paths.length === 0) return [];
    return paths.reduce((longest, path) => path.length > longest.length ? path : longest);
  }

  _pathDuration(path, tasks) {
    return path.reduce((sum, taskId) => {
      const task = tasks.find(t => t.id === taskId);
      return sum + (task ? task.estimatedDuration || 0 : 0);
    }, 0);
  }

  _countBottlenecks(path, tasks) {
    return path.filter(id => {
      const task = tasks.find(t => t.id === id);
      return task && task.dependencies && task.dependencies.length > 2;
    }).length;
  }
}

export { CriticalPathFinder };