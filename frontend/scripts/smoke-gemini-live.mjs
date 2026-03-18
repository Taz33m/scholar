import { createSmokeLogger, runGeminiLiveSmoke } from "./lib/gemini-live-smoke.mjs";

const logger = createSmokeLogger();

runGeminiLiveSmoke({ logger }).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[smoke] FAILED: ${message}`);
  process.exitCode = 1;
});
