import fs from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import scenarios from "../scripts/lib/smoke-scenarios.json";

interface SmokeToolEventSummary {
  success: boolean;
  message: string;
  requestedToolName: string;
  executedToolName: string;
  timestamp: string;
}

interface SmokeAssistantTurnSummary {
  text: string;
  timestamp: string;
}

interface SmokeSnapshot {
  activeTab: string;
  availableTabs: string[];
  voiceStatus: string;
  lastToolEvent: SmokeToolEventSummary | null;
  assistant: SmokeAssistantTurnSummary | null;
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

interface ScenarioStep {
  id: string;
  prompt: string;
  expectedTools?: string[];
  assistantSource?: "live" | "tutor_text";
  expectAssistantTextIncludes?: string[];
  expectAssistantMinLength?: number;
  expectCanvasShapeCountMin?: number;
  expectCanvasTextIncludes?: string[];
  expectFlashcardCountMin?: number;
  expectQuizAvailable?: boolean;
  expectQuizQuestionCountMin?: number;
  expectVisualizationReady?: boolean;
  expectActiveTab?: string;
}

type TutoringScenario = {
  id: string;
  description: string;
  steps: ScenarioStep[];
};

const SCENARIO_ID = process.env.GEMINILEARN_SMOKE_SCENARIO_ID;
const tutoringScenarios = scenarios as TutoringScenario[];

const selectedScenario = tutoringScenarios.find((scenario) => scenario.id === SCENARIO_ID);

if (!selectedScenario) {
  throw new Error(
    `Unknown tutoring scenario: ${SCENARIO_ID ?? "<unset>"}`,
  );
}

test.setTimeout(5 * 60_000);

const waitForSmokeBridge = async (page: Page) => {
  await page.waitForFunction(() => Boolean(window.__geminilearnSmoke), {
    timeout: 30_000,
  });
};

const waitForStableSessionRoute = async (page: Page) => {
  await page.waitForFunction(
    () => !window.location.pathname.endsWith("/sessions/smoke-scenario"),
    {
      timeout: 30_000,
    },
  );
};

const getSnapshot = (page: Page) =>
  page.evaluate(() => window.__geminilearnSmoke!.getSnapshot());

const writeArtifacts = async ({
  page,
  finalSnapshot,
  steps,
  error,
}: {
  page: Page;
  finalSnapshot: SmokeSnapshot | null;
  steps: Array<Record<string, unknown>>;
  error?: unknown;
}) => {
  const artifactDir = process.env.GEMINILEARN_SMOKE_ARTIFACT_DIR;
  if (!artifactDir) {
    return;
  }

  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(
    path.join(artifactDir, "result.json"),
    JSON.stringify(
      {
        scenarioId: selectedScenario.id,
        description: selectedScenario.description,
        error: error
          ? error instanceof Error
            ? error.message
            : String(error)
          : null,
        finalSnapshot,
        steps,
      },
      null,
      2,
    ),
  );

  if (page.isClosed()) {
    return;
  }

  try {
    await page.screenshot({
      fullPage: true,
      path: path.join(artifactDir, "page.png"),
    });
  } catch {
    // Preserve the JSON artifact even if Playwright has already torn down the page.
  }
};

test(`tutoring scenario: ${selectedScenario.id}`, async ({ page, baseURL }) => {
  const appBaseUrl = baseURL ?? "http://127.0.0.1:3000";
  const stepResults: Array<Record<string, unknown>> = [];
  let finalSnapshot: SmokeSnapshot | null = null;

  try {
    await page.goto(`${appBaseUrl}/sessions/smoke-scenario`, {
      waitUntil: "domcontentloaded",
    });
    await waitForSmokeBridge(page);

    await page.evaluate(async () => {
      await window.__geminilearnSmoke!.resetWorkspace();
    });
    await page.waitForLoadState("domcontentloaded");
    await waitForSmokeBridge(page);
    await waitForStableSessionRoute(page);
    await waitForSmokeBridge(page);

    await page.evaluate(async () => {
      await window.__geminilearnSmoke!.connectTextAgent();
    });

    for (const [stepIndex, step] of selectedScenario.steps.entries()) {
      console.log(
        `[tutoring-scenario] Step ${stepIndex + 1}/${selectedScenario.steps.length} ${step.id}: ${step.prompt}`,
      );
      const beforeSnapshot = await getSnapshot(page);
      const beforeAssistantTimestamp = beforeSnapshot.assistant?.timestamp;
      const stepStart = Date.now();
      const stepRecord: Record<string, unknown> = {
        stepId: step.id,
        prompt: step.prompt,
        status: "running",
        beforeSnapshot,
      };
      stepResults.push(stepRecord);

      await page.evaluate(async (prompt) => {
        await window.__geminilearnSmoke!.sendPrompt(prompt);
      }, step.prompt);

      let toolResult: SmokeToolEventSummary | null = null;
      if (step.expectedTools && step.expectedTools.length > 0) {
        toolResult = await page.evaluate(
          async ({ expectedTools }) =>
            window.__geminilearnSmoke!.waitForToolResult(expectedTools, 60_000),
          {
            expectedTools: step.expectedTools,
          },
        );
      }

      let assistantResult: SmokeAssistantTurnSummary | null = null;
      if (
        (step.expectAssistantTextIncludes?.length ?? 0) > 0 ||
        step.expectAssistantMinLength
      ) {
        if (step.assistantSource === "tutor_text") {
          assistantResult = await page.evaluate(
            async (prompt) => window.__geminilearnSmoke!.requestTutorReply(prompt),
            step.prompt,
          );
        } else {
          assistantResult = await page.evaluate(
            async ({ afterTimestamp, minLength }) =>
              window.__geminilearnSmoke!.waitForAssistantTurn({
                afterTimestamp,
                minLength,
                quietPeriodMs: 500,
                timeoutMs: 30_000,
              }),
            {
              afterTimestamp: beforeAssistantTimestamp ?? undefined,
              minLength: step.expectAssistantMinLength ?? 1,
            },
          );
        }
      }

      await page.waitForTimeout(250);
      const afterSnapshot = await getSnapshot(page);
      const durationMs = Date.now() - stepStart;
      stepRecord.toolResult = toolResult;
      stepRecord.assistantResult = assistantResult;
      stepRecord.snapshot = afterSnapshot;
      stepRecord.durationMs = durationMs;

      if (toolResult) {
        expect(toolResult.success).toBe(true);
        if (step.expectedTools?.length) {
          expect(step.expectedTools).toContain(toolResult.executedToolName);
        }
      }

      if (assistantResult) {
        expect(assistantResult.text.length).toBeGreaterThanOrEqual(
          step.expectAssistantMinLength ?? 1,
        );

        const normalizedAssistantText = assistantResult.text.toLowerCase();
        for (const expected of step.expectAssistantTextIncludes ?? []) {
          expect(normalizedAssistantText).toContain(expected.toLowerCase());
        }
      }

      if (step.expectCanvasShapeCountMin !== undefined) {
        expect(afterSnapshot.canvas.shapeCount).toBeGreaterThanOrEqual(
          step.expectCanvasShapeCountMin,
        );
      }

      if (step.expectCanvasTextIncludes?.length) {
        const canvasTexts = afterSnapshot.canvas.shapes
          .map((shape) => shape.text?.toLowerCase() ?? "")
          .join(" ");
        for (const expected of step.expectCanvasTextIncludes) {
          expect(canvasTexts).toContain(expected.toLowerCase());
        }
      }

      if (step.expectFlashcardCountMin !== undefined) {
        expect(afterSnapshot.flashcards.count).toBeGreaterThanOrEqual(
          step.expectFlashcardCountMin,
        );
      }

      if (step.expectQuizAvailable !== undefined) {
        expect(afterSnapshot.quiz.available).toBe(step.expectQuizAvailable);
      }

      if (step.expectQuizQuestionCountMin !== undefined) {
        expect(afterSnapshot.quiz.questionCount).toBeGreaterThanOrEqual(
          step.expectQuizQuestionCountMin,
        );
      }

      if (step.expectVisualizationReady !== undefined) {
        expect(afterSnapshot.visualization.ready).toBe(
          step.expectVisualizationReady,
        );
      }

      if (step.expectActiveTab) {
        expect(afterSnapshot.activeTab).toBe(step.expectActiveTab);
      }

      stepRecord.status = "completed";
      console.log(
        `[tutoring-scenario] Completed ${step.id} in ${durationMs}ms`,
      );
    }

    finalSnapshot = await getSnapshot(page);
    await writeArtifacts({
      page,
      finalSnapshot,
      steps: stepResults,
    });
  } catch (error) {
    try {
      finalSnapshot = await getSnapshot(page);
    } catch {
      finalSnapshot = null;
    }

    await writeArtifacts({
      page,
      finalSnapshot,
      steps: stepResults,
      error,
    });
    throw error;
  }
});
