export const BackoffStrategy = { FIXED: 'fixed', LINEAR: 'linear', EXPONENTIAL: 'exponential' };

function calculateDelay(strategy, initial, max, attempt) {
  switch (strategy) {
    case 'fixed': return initial;
    case 'linear': return Math.min(initial * (attempt + 1), max);
    case 'exponential': default: return Math.min(initial * Math.pow(2, attempt), max);
  }
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

export async function retryWithBackoff(fn, options) {
  options = options || {};
  const maxRetries = options.maxRetries || 5;
  const initialDelayMs = options.initialDelayMs || 1000;
  const maxDelayMs = options.maxDelayMs || 30000;
  const strategy = options.strategy || BackoffStrategy.EXPONENTIAL;
  const shouldRetry = options.shouldRetry || function() { return true; };
  const onRetry = options.onRetry || null;
  let lastError = null;
  let attempts = 0;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    attempts++;
    try {
      const result = await fn(attempt);
      return { success: true, value: result, attempts: attempts };
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries && shouldRetry(error, attempt)) {
        const delay = calculateDelay(strategy, initialDelayMs, maxDelayMs, attempt);
        if (onRetry) onRetry(error, attempt, delay);
        await sleep(delay);
      } else {
        break;
      }
    }
  }
  return { success: false, error: lastError, attempts: attempts };
}

export function withRetry(fn, options) {
  return async function() {
    const args = arguments;
    return retryWithBackoff(function() { return fn.apply(null, args); }, options);
  };
}