const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function initializeWithRetry(initialize, {
  attempts = 5,
  initialDelayMs = 1_000,
  maxDelayMs = 8_000,
  wait = sleep
} = {}) {
  let delayMs = initialDelayMs;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await initialize();
      return;
    } catch (error) {
      if (attempt === attempts) throw error;

      console.warn(`Database initialization failed (attempt ${attempt}/${attempts}); retrying in ${delayMs}ms.`);
      await wait(delayMs);
      delayMs = Math.min(delayMs * 2, maxDelayMs);
    }
  }
}
