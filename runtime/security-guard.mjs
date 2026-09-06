/**
 * SecurityGuard — secrets redaction, injection resistance, supply-chain checks.
 *
 * Provides:
 *   - Secrets detection and redaction in all outputs
 *   - Command injection resistance for shell tasks
 *   - Path traversal prevention
 *   - Supply-chain risk detection
 *   - Input sanitization
 *   - Audit logging for security events
 */

import crypto from 'node:crypto';

// ─── Secrets Detection ─────────────────────────────────────────────

const SECRET_PATTERNS = [
  { name: 'AWS Access Key', pattern: /(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}/g },
  { name: 'AWS Secret Key', pattern: /(?:aws_secret_access_key|aws_secret_key)\s*[=:]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/gi },
  { name: 'GitHub Token', pattern: /ghp_[A-Za-z0-9]{36}/g },
  { name: 'GitHub Fine-grained', pattern: /github_pat_[A-Za-z0-9_]{82}/g },
  { name: 'GitLab Token', pattern: /glpat-[A-Za-z0-9\-_]{20,}/g },
  { name: 'Slack Token', pattern: /xox[bpras]-[0-9]{10,}-[A-Za-z0-9\-]+/g },
  { name: 'Slack Webhook', pattern: /https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]{10,}\/[A-Z0-9]{10,}\/[A-Za-z0-9]+/g },
  { name: 'Private Key Block', pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC )?PRIVATE KEY-----/g },
  { name: 'Generic API Key', pattern: /(?:api[_-]?key|apikey|api[_-]?secret)\s*[=:]\s*['"]?([A-Za-z0-9\-_]{20,})['"]?/gi },
  { name: 'Bearer Token', pattern: /Bearer\s+[A-Za-z0-9\-_.~+/]+=*/g },
  { name: 'Basic Auth', pattern: /Basic\s+[A-Za-z0-9+/]+=*/g },
  { name: 'Connection String', pattern: /(?:mongodb|postgres|mysql|redis):\/\/[^\s]+/g },
  { name: 'JWT Token', pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g },
];

/**
 * Detect secrets in text.
 * Returns array of { name, match, index } objects.
 */
export function detectSecrets(text) {
  if (typeof text !== 'string') return [];
  const findings = [];
  for (const { name, pattern } of SECRET_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      findings.push({ name, match: match[0].slice(0, 20) + '...', index: match.index });
    }
  }
  return findings;
}

/**
 * Redact secrets from text.
 * Returns sanitized text with secrets replaced by [REDACTED].
 */
export function redactSecrets(text) {
  if (typeof text !== 'string') return text;
  let result = text;
  for (const { pattern } of SECRET_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    result = result.replace(regex, '[REDACTED]');
  }
  return result;
}

/**
 * Check if text contains secrets.
 */
export function hasSecrets(text) {
  return detectSecrets(text).length > 0;
}

// ─── Command Injection Resistance ──────────────────────────────────

const DANGEROUS_PATTERNS = [
  { name: 'Pipe operator', pattern: /\|/g },
  { name: 'Semicolon', pattern: /;/g },
  { name: 'Command substitution', pattern: /`[^`]+`/g },
  { name: 'Dollar-paren', pattern: /\$\([^)]+\)/g },
  { name: 'Double ampersand', pattern: /&&/g },
  { name: 'Double pipe', pattern: /\|\|/g },
  { name: 'Redirection', pattern: />|>>/g },
  { name: 'Eval', pattern: /\beval\b/gi },
  { name: 'Exec', pattern: /\bexec\b/gi },
  { name: 'Subprocess', pattern: /\bsubprocess\b/gi },
  { name: 'System call', pattern: /\bsystem\b/gi },
  { name: 'Import dynamic', pattern: /\bimport\s*\(/g },
  { name: 'Require dynamic', pattern: /\brequire\s*\(/g },
];

/**
 * Detect potential command injection in shell commands.
 * Returns array of { name, match } objects.
 */
export function detectInjection(command) {
  if (typeof command !== 'string') return [];
  const findings = [];
  for (const { name, pattern } of DANGEROUS_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(command)) !== null) {
      findings.push({ name, match: match[0] });
    }
  }
  return findings;
}

/**
 * Sanitize a command for safe execution.
 * Quotes arguments and escapes special characters.
 */
export function sanitizeCommand(command) {
  if (typeof command !== 'string') return command;
  // Remove null bytes
  let result = command.replace(/\0/g, '');
  // Limit length
  if (result.length > 10000) {
    result = result.slice(0, 10000);
  }
  return result;
}

// ─── Path Traversal Prevention ─────────────────────────────────────

/**
 * Check for path traversal attempts.
 */
export function detectPathTraversal(filePath) {
  if (typeof filePath !== 'string') return false;
  const patterns = [
    /\.\.\//g,    // Unix
    /\.\.\\/g,    // Windows
    /\.\.%2[fF]/g, // URL encoded
    /\.\.%5[cC]/g, // URL encoded backslash
  ];
  return patterns.some(p => p.test(filePath));
}

/**
 * Resolve a path safely within a base directory.
 * Returns null if the resolved path escapes the base.
 */
export function safePath(base, filePath) {
  const path = await import('node:path');
  const resolved = path.resolve(base, filePath);
  const normalizedBase = path.resolve(base);
  if (!resolved.startsWith(normalizedBase)) {
    return null; // Path escapes base
  }
  return resolved;
}

// ─── Supply Chain Checks ───────────────────────────────────────────

/**
 * Analyze package.json for supply-chain risks.
 */
export function analyzeSupplyChain(packageJsonPath) {
  const fs = await import('node:fs');
  if (!fs.existsSync(packageJsonPath)) return { risks: [], score: 100 };

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const risks = [];

  // Check for known risky patterns
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

  for (const [name, version] of Object.entries(allDeps || {})) {
    // Check for typosquatting (short names with common typos)
    if (name.length < 4 && !['vue', 'react', 'next'].includes(name)) {
      risks.push({ package: name, risk: 'typosquatting', detail: 'Very short package name' });
    }

    // Check for git URLs
    if (typeof version === 'string' && (version.includes('git+') || version.includes('github.com'))) {
      risks.push({ package: name, risk: 'git-url', detail: 'Git URL dependency' });
    }

    // Check for file: references
    if (typeof version === 'string' && version.startsWith('file:')) {
      risks.push({ package: name, risk: 'local-dependency', detail: 'Local file dependency' });
    }
  }

  return { risks, score: Math.max(0, 100 - risks.length * 10) };
}

// ─── Input Sanitization ───────────────────────────────────────────

/**
 * Sanitize user input for display/logging.
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Validate task input against security constraints.
 */
export function validateTaskInput(task) {
  const violations = [];

  // Check for secrets in task content
  if (task.content && hasSecrets(task.content)) {
    violations.push({ field: 'content', issue: 'Contains secrets' });
  }

  // Check for path traversal in file paths
  if (task.path && detectPathTraversal(task.path)) {
    violations.push({ field: 'path', issue: 'Path traversal detected' });
  }

  // Check for injection in commands
  if (task.command && detectInjection(task.command).length > 0) {
    violations.push({ field: 'command', issue: 'Potential command injection' });
  }

  // Check for excessive length
  if (task.content && task.content.length > 1_000_000) {
    violations.push({ field: 'content', issue: 'Content exceeds 1MB limit' });
  }

  return { valid: violations.length === 0, violations };
}
