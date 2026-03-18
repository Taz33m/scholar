import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import smokeCases from "./lib/smoke-wheel-cases.json" with { type: "json" };
import { createSmokeLogger, runGeminiLiveSmoke } from "./lib/gemini-live-smoke.mjs";

const BASE_URL =
  process.env.GEMINILEARN_SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const PLAYWRIGHT_CONFIG = path.join(process.cwd(), "playwright.config.ts");
const PLAYWRIGHT_SPEC = path.join(process.cwd(), "smoke", "smoke-wheel.spec.ts");
const PLAYWRIGHT_CLI = path.join(process.cwd(), "node_modules", "playwright", "cli.js");
const STATE_PATH = path.join(os.tmpdir(), "geminilearn-smoke-wheel-state.json");
const ARTIFACT_ROOT = path.join(os.tmpdir(), "geminilearn-smoke");
const MAX_BROWSER_INFRA_RETRIES = 1;

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const MODE = process.env.GEMINILEARN_SMOKE_MODE === "all" ? "all" : "wheel";
const ITERATIONS = parsePositiveInteger(
  process.env.GEMINILEARN_SMOKE_ITERATIONS,
  MODE === "all" ? smokeCases.length : 1,
);
const OVERRIDE_CASE_ID = process.env.GEMINILEARN_SMOKE_CASE ?? null;

const sanitizeTimestamp = (value) => value.replaceAll(":", "-");

const readCursorState = async () => {
  try {
    const raw = await readFile(STATE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Number.isInteger(parsed.nextIndex) && parsed.nextIndex >= 0
      ? parsed.nextIndex
      : 0;
  } catch {
    return 0;
  }
};

const writeCursorState = async (nextIndex) => {
  await writeFile(STATE_PATH, JSON.stringify({ nextIndex }, null, 2));
};

const ensureAppAvailable = async () => {
  let response;

  try {
    response = await fetch(new URL("/api/voice/token", BASE_URL), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    const detail =
      error instanceof Error && error.message ? ` ${error.message}` : "";
    throw new Error(
      `Unable to reach ${BASE_URL}. Keep localhost:3000 running before invoking smoke:wheel.${detail}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `Smoke preflight failed against ${BASE_URL}: HTTP ${response.status}`,
    );
  }
};

const browserSmokeInfraFailurePatterns = [
  'setting up "context"',
  "browser.newcontext: test ended.",
  "trust_store_mac.cc",
  "error parsing certificate",
  "failed parsing extensions",
];

const isBrowserInfraFailure = (output) => {
  const normalized = output.toLowerCase();
  return browserSmokeInfraFailurePatterns.some((pattern) =>
    normalized.includes(pattern.toLowerCase()),
  );
};

const runBrowserSmokeCase = async (caseConfig, iterationLabel) => {
  let attempt = 0;

  while (attempt <= MAX_BROWSER_INFRA_RETRIES) {
    const artifactDir = path.join(
      ARTIFACT_ROOT,
      sanitizeTimestamp(new Date().toISOString()),
      caseConfig.id,
    );
    await mkdir(artifactDir, { recursive: true });

    const result = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          PLAYWRIGHT_CLI,
          "test",
          PLAYWRIGHT_SPEC,
          "--config",
          PLAYWRIGHT_CONFIG,
          "--project",
          "chrome",
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            GEMINILEARN_SMOKE_ARTIFACT_DIR: artifactDir,
            GEMINILEARN_SMOKE_BASE_URL: BASE_URL,
            GEMINILEARN_SMOKE_CASE_ID: caseConfig.id,
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      let combinedOutput = "";

      child.stdout.on("data", (chunk) => {
        const text = chunk.toString();
        combinedOutput += text;
        process.stdout.write(text);
      });

      child.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        combinedOutput += text;
        process.stderr.write(text);
      });

      child.on("exit", (code) => {
        resolve({
          artifactDir,
          code,
          combinedOutput,
        });
      });

      child.on("error", (error) => {
        reject(error);
      });
    });

    if (result.code === 0) {
      return;
    }

    const shouldRetryInfraFailure =
      attempt < MAX_BROWSER_INFRA_RETRIES &&
      isBrowserInfraFailure(result.combinedOutput);

    if (!shouldRetryInfraFailure) {
      throw new Error(
        `${iterationLabel} browser smoke failed for ${caseConfig.id}. Artifacts: ${result.artifactDir}`,
      );
    }

    attempt += 1;
    console.warn(
      `${iterationLabel} browser infra failure detected for ${caseConfig.id}; retrying once`,
    );
  }
};

const runSmokeCase = async (caseConfig, iterationLabel) => {
  console.log(`${iterationLabel} Running ${caseConfig.id}: ${caseConfig.description}`);

  if (caseConfig.kind === "live") {
    const logger = createSmokeLogger(console.log, `${iterationLabel} [${caseConfig.id}]`);
    await runGeminiLiveSmoke({ logger });
    console.log(`${iterationLabel} Passed ${caseConfig.id}`);
    return;
  }

  await runBrowserSmokeCase(caseConfig, iterationLabel);
  console.log(`${iterationLabel} Passed ${caseConfig.id}`);
};

const resolveWheelCases = async () => {
  if (OVERRIDE_CASE_ID) {
    const match = smokeCases.find((entry) => entry.id === OVERRIDE_CASE_ID);
    if (!match) {
      throw new Error(`Unknown smoke case override: ${OVERRIDE_CASE_ID}`);
    }

    return {
      casesToRun: [match],
      shouldPersistCursor: false,
      nextCursorIndex: null,
    };
  }

  if (MODE === "all") {
    return {
      casesToRun: smokeCases,
      shouldPersistCursor: false,
      nextCursorIndex: null,
    };
  }

  const startIndex = await readCursorState();
  const casesToRun = Array.from({ length: ITERATIONS }, (_, offset) => {
    return smokeCases[(startIndex + offset) % smokeCases.length];
  });

  return {
    casesToRun,
    shouldPersistCursor: true,
    nextCursorIndex: startIndex,
  };
};

const main = async () => {
  await ensureAppAvailable();

  const { casesToRun, shouldPersistCursor, nextCursorIndex } =
    await resolveWheelCases();

  console.log(
    `[smoke-wheel] Starting ${casesToRun.length} case(s) against ${BASE_URL}`,
  );

  let cursorIndex = nextCursorIndex;

  for (let index = 0; index < casesToRun.length; index += 1) {
    const caseConfig = casesToRun[index];
    const iterationLabel = `[smoke-wheel ${index + 1}/${casesToRun.length}]`;
    await runSmokeCase(caseConfig, iterationLabel);

    if (shouldPersistCursor && cursorIndex !== null) {
      cursorIndex = (cursorIndex + 1) % smokeCases.length;
      await writeCursorState(cursorIndex);
    }
  }

  console.log("[smoke-wheel] Completed successfully");
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[smoke-wheel] FAILED: ${message}`);
  process.exitCode = 1;
});
