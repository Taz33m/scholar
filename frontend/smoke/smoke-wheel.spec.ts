import fs from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import smokeCases from "../scripts/lib/smoke-wheel-cases.json";

type BrowserSmokeCase = Extract<
  (typeof smokeCases)[number],
  { kind: "browser" }
>;

interface SmokeToolEventSummary {
  success: boolean;
  message: string;
  requestedToolName: string;
  executedToolName: string;
  timestamp: string;
}

interface SmokeSnapshot {
  activeTab: string;
  availableTabs: string[];
  voiceStatus: string;
  lastToolEvent: SmokeToolEventSummary | null;
  flashcards: {
    count: number;
    mode: string;
  };
  quiz: {
    available: boolean;
    questionCount: number;
    isSubmitted: boolean;
  };
  visualization: {
    ready: boolean;
    mode: string;
    hasImage: boolean;
  };
  canvas: {
    shapeCount: number;
    shapes: Array<{
      id: string;
      type: string;
      text: string | null;
    }>;
  };
}

interface SmokeTimingBreakdown {
  navigateMs: number;
  resetMs: number;
  seedMs: number;
  connectMs: number;
  promptSendMs: number;
  waitForToolResultMs: number;
  settleMs: number;
  snapshotMs: number;
  totalMs: number;
}

const CASE_ID = process.env.GEMINILEARN_SMOKE_CASE_ID;

const selectedCase = smokeCases.find(
  (entry): entry is BrowserSmokeCase =>
    entry.kind === "browser" && entry.id === CASE_ID,
);

if (!selectedCase) {
  throw new Error(
    `Unknown or non-browser smoke case: ${CASE_ID ?? "<unset>"}`,
  );
}

const waitForSmokeBridge = async (page: Page) => {
  await page.waitForFunction(() => Boolean(window.__geminilearnSmoke), {
    timeout: 30_000,
  });
};

const waitForStableSessionRoute = async (page: Page) => {
  await page.waitForFunction(
    () => !window.location.pathname.endsWith("/sessions/smoke-wheel"),
    {
      timeout: 30_000,
    },
  );
};

const getSnapshot = (page: Page) =>
  page.evaluate(() => window.__geminilearnSmoke!.getSnapshot());

const writeFailureArtifacts = async (
  page: Page,
  snapshot: SmokeSnapshot | null,
  timings: SmokeTimingBreakdown | null,
  error: unknown,
) => {
  const artifactDir = process.env.GEMINILEARN_SMOKE_ARTIFACT_DIR;
  if (!artifactDir) {
    return;
  }

  await fs.mkdir(artifactDir, { recursive: true });
  await page.screenshot({
    fullPage: true,
    path: path.join(artifactDir, "page.png"),
  });
  await fs.writeFile(
    path.join(artifactDir, "snapshot.json"),
    JSON.stringify(
      {
        caseId: selectedCase.id,
        prompt: selectedCase.prompt,
        error: error instanceof Error ? error.message : String(error),
        timings,
        snapshot,
      },
      null,
      2,
    ),
  );
};

const writeSuccessArtifacts = async (
  snapshot: SmokeSnapshot,
  timings: SmokeTimingBreakdown,
) => {
  const artifactDir = process.env.GEMINILEARN_SMOKE_ARTIFACT_DIR;
  if (!artifactDir) {
    return;
  }

  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(
    path.join(artifactDir, "result.json"),
    JSON.stringify(
      {
        caseId: selectedCase.id,
        prompt: selectedCase.prompt,
        timings,
        snapshot,
      },
      null,
      2,
    ),
  );
};

const measureStep = async <T>(
  fn: () => Promise<T>,
): Promise<{ durationMs: number; value: T }> => {
  const start = Date.now();
  const value = await fn();
  return {
    durationMs: Date.now() - start,
    value,
  };
};

test(`browser smoke: ${selectedCase.id}`, async ({ page, baseURL }) => {
  let latestSnapshot: SmokeSnapshot | null = null;
  let timings: SmokeTimingBreakdown | null = null;
  const appBaseUrl = baseURL ?? "http://127.0.0.1:3000";
  const totalStart = Date.now();

  try {
    const navigate = await measureStep(() =>
      page.goto(`${appBaseUrl}/sessions/smoke-wheel`, {
        waitUntil: "domcontentloaded",
      }),
    );
    await waitForSmokeBridge(page);

    const reset = await measureStep(() =>
      page.evaluate(async () => {
        await window.__geminilearnSmoke!.resetWorkspace();
      }),
    );
    await page.waitForLoadState("domcontentloaded");
    await waitForSmokeBridge(page);
    await waitForStableSessionRoute(page);
    await waitForSmokeBridge(page);

    let seedMs = 0;
    if (selectedCase.canvasFixture) {
      const seeded = await measureStep(() =>
        page.evaluate(async (fixture) => {
          await window.__geminilearnSmoke!.seedCanvas(fixture);
        }, selectedCase.canvasFixture),
      );
      seedMs = seeded.durationMs;
    }

    const initialSnapshot = await getSnapshot(page);

    const connect = await measureStep(() =>
      page.evaluate(async () => {
        await window.__geminilearnSmoke!.connectTextAgent();
      }),
    );

    const promptSend = await measureStep(() =>
      page.evaluate(async (prompt) => {
        await window.__geminilearnSmoke!.sendPrompt(prompt);
      }, selectedCase.prompt),
    );

    const toolWait = await measureStep(() =>
      page.evaluate(
        async ({ expectedTools }) =>
          window.__geminilearnSmoke!.waitForToolResult(expectedTools, 60_000),
        {
          expectedTools: selectedCase.expectedTools,
        },
      ),
    );

    const settle = await measureStep(() => page.waitForTimeout(250));
    const snapshot = await measureStep(() => getSnapshot(page));
    latestSnapshot = snapshot.value;
    timings = {
      navigateMs: navigate.durationMs,
      resetMs: reset.durationMs,
      seedMs,
      connectMs: connect.durationMs,
      promptSendMs: promptSend.durationMs,
      waitForToolResultMs: toolWait.durationMs,
      settleMs: settle.durationMs,
      snapshotMs: snapshot.durationMs,
      totalMs: Date.now() - totalStart,
    };

    expect(latestSnapshot.lastToolEvent).not.toBeNull();
    expect(latestSnapshot.lastToolEvent?.success).toBe(true);

    switch (selectedCase.assertion) {
      case "flashcards":
        expect(latestSnapshot.lastToolEvent?.executedToolName).toBe(
          "generate_flashcards",
        );
        expect(latestSnapshot.flashcards.count).toBeGreaterThanOrEqual(3);
        expect(latestSnapshot.flashcards.count).toBeLessThanOrEqual(8);
        expect(latestSnapshot.availableTabs).toContain("flashcards");
        expect(latestSnapshot.activeTab).toBe("flashcards");
        break;
      case "quiz":
        expect(latestSnapshot.lastToolEvent?.executedToolName).toBe(
          "generate_quiz",
        );
        expect(latestSnapshot.quiz.available).toBe(true);
        expect(latestSnapshot.quiz.questionCount).toBeGreaterThanOrEqual(3);
        expect(latestSnapshot.quiz.questionCount).toBeLessThanOrEqual(8);
        expect(latestSnapshot.availableTabs).toContain("quiz");
        expect(latestSnapshot.activeTab).toBe("quiz");
        break;
      case "visualization":
        expect([
          "generate_diagram",
          "generate_visualization",
        ]).toContain(latestSnapshot.lastToolEvent?.executedToolName);
        expect(latestSnapshot.visualization.ready).toBe(true);
        expect(latestSnapshot.visualization.hasImage).toBe(true);
        expect(latestSnapshot.availableTabs).toContain("visualization");
        expect(latestSnapshot.activeTab).toBe("visualization");
        break;
      case "canvas_edit":
        expect(latestSnapshot.lastToolEvent?.executedToolName).toBe(
          "edit_canvas",
        );
        expect(latestSnapshot.canvas.shapeCount).toBeGreaterThan(
          initialSnapshot.canvas.shapeCount,
        );
        expect(
          latestSnapshot.canvas.shapes.some(
            (shape) =>
              shape.type === "highlight" ||
              shape.text?.toLowerCase().includes("important"),
          ),
        ).toBe(true);
        break;
      case "canvas_inspect":
        expect(latestSnapshot.lastToolEvent?.executedToolName).toBe(
          "get_canvas_snapshot",
        );
        expect(latestSnapshot.canvas.shapeCount).toBe(
          initialSnapshot.canvas.shapeCount,
        );
        break;
      default:
        throw new Error(`Unhandled smoke assertion: ${selectedCase.assertion}`);
    }

    console.log(
      `[smoke-case timings] ${selectedCase.id} ${JSON.stringify(timings)}`,
    );
    await writeSuccessArtifacts(latestSnapshot, timings);
  } catch (error) {
    if (!latestSnapshot) {
      try {
        latestSnapshot = await getSnapshot(page);
      } catch {
        latestSnapshot = null;
      }
    }
    await writeFailureArtifacts(page, latestSnapshot, timings, error);
    throw error;
  }
});
