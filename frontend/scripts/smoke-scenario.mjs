import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import scenarios from "./lib/smoke-scenarios.json" with { type: "json" };

const BASE_URL =
  process.env.GEMINILEARN_SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const PLAYWRIGHT_CONFIG = path.join(process.cwd(), "playwright.config.ts");
const PLAYWRIGHT_SPEC = path.join(
  process.cwd(),
  "smoke",
  "tutoring-scenario.spec.ts",
);
const PLAYWRIGHT_CLI = path.join(process.cwd(), "node_modules", "playwright", "cli.js");
const ARTIFACT_ROOT = path.join(os.tmpdir(), "geminilearn-smoke-scenarios");
const MAX_BROWSER_INFRA_RETRIES = 1;

const SCENARIO_ID =
  process.env.GEMINILEARN_SMOKE_SCENARIO_ID ?? "data_structures_tutor";

const selectedScenario = scenarios.find((scenario) => scenario.id === SCENARIO_ID);

if (!selectedScenario) {
  throw new Error(`Unknown tutoring scenario: ${SCENARIO_ID}`);
}

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

const sanitizeTimestamp = (value) => value.replaceAll(":", "-");

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
      `Unable to reach ${BASE_URL}. Keep localhost:3000 running before invoking smoke:scenario.${detail}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `Scenario preflight failed against ${BASE_URL}: HTTP ${response.status}`,
    );
  }
};

const runScenario = async () => {
  let attempt = 0;

  while (attempt <= MAX_BROWSER_INFRA_RETRIES) {
    const artifactDir = path.join(
      ARTIFACT_ROOT,
      sanitizeTimestamp(new Date().toISOString()),
      SCENARIO_ID,
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
            GEMINILEARN_SMOKE_SCENARIO_ID: SCENARIO_ID,
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
      return result.artifactDir;
    }

    const shouldRetryInfraFailure =
      attempt < MAX_BROWSER_INFRA_RETRIES &&
      isBrowserInfraFailure(result.combinedOutput);

    if (!shouldRetryInfraFailure) {
      throw new Error(
        `Tutoring scenario failed for ${SCENARIO_ID}. Artifacts: ${result.artifactDir}`,
      );
    }

    attempt += 1;
    console.warn(
      `[smoke-scenario] browser infra failure detected for ${SCENARIO_ID}; retrying once`,
    );
  }

  throw new Error(`Tutoring scenario retries exhausted for ${SCENARIO_ID}`);
};

const main = async () => {
  await ensureAppAvailable();
  console.log(
    `[smoke-scenario] Running ${SCENARIO_ID}: ${selectedScenario.description}`,
  );
  const artifactDir = await runScenario();
  console.log(
    `[smoke-scenario] Completed successfully. Artifacts: ${artifactDir}`,
  );
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[smoke-scenario] FAILED: ${message}`);
  process.exitCode = 1;
});
