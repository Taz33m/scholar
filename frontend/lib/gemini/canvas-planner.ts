import { readFile } from "node:fs/promises";
import path from "node:path";

import { GoogleGenAI } from "@google/genai";

import {
  CANVAS_PLAN_RESPONSE_JSON_SCHEMA,
  normalizeCanvasPlan,
  type CanvasPlan,
  type CanvasOperation,
  type CanvasScene,
} from "@/lib/canvas-plan";

const GEMINI_CANVAS_PLANNER_MODEL =
  process.env.GEMINI_CANVAS_PLANNER_MODEL ?? "gemini-2.5-flash";

export interface GenerateCanvasPlanInput {
  goal: string;
  context?: string | null;
  scene: CanvasScene;
  imageData?: string;
}

const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  return new GoogleGenAI({ apiKey });
};

const loadCanvasSkill = async () => {
  const skillPath = path.join(
    process.cwd(),
    "agents",
    "canvas-specialist",
    "SKILL.md",
  );
  return readFile(skillPath, "utf8");
};

const parseDataUrl = (value: string) => {
  const match = value.match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    throw new Error("Canvas image data must be a valid base64 data URL");
  }

  return {
    mimeType: match[1],
    data: match[2],
  };
};

const normalizeComparableText = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

const EMPTY_BOARD_DRAW_KEYWORDS = /\b(draw|sketch|diagram|whiteboard|use the canvas|show on the canvas|build)\b/i;
const LINKED_LIST_KEYWORDS = /\blinked list\b/i;

const extractExplicitLabelText = (goal: string): string | null => {
  const directLabelMatch = goal.match(
    /\blabel\s+(?:it|this|that|them)\s+(?:as\s+)?["“']?([^"”'.,!?]+)["”']?/i,
  );
  if (!directLabelMatch) {
    return null;
  }

  const labelText = directLabelMatch[1]?.trim();
  return labelText && labelText.length > 0 ? labelText : null;
};

const getPrimaryTargetShapeRef = (
  operations: CanvasOperation[],
): string | null => {
  for (const operation of operations) {
    if ("targetShapeRef" in operation) {
      return operation.targetShapeRef;
    }
  }

  return null;
};

const planIncludesExplicitLabel = (plan: CanvasPlan, labelText: string) => {
  const normalizedLabel = normalizeComparableText(labelText);

  return plan.operations.some((operation) => {
    switch (operation.type) {
      case "annotate":
      case "replace_text":
      case "create_node":
        return normalizeComparableText(operation.text).includes(normalizedLabel);
      case "connect":
        return Boolean(
          operation.label &&
            normalizeComparableText(operation.label).includes(normalizedLabel),
        );
      default:
        return false;
    }
  });
};

const getReferencedShapeRefs = (operation: CanvasOperation): string[] => {
  switch (operation.type) {
    case "annotate":
    case "emphasize":
    case "replace_text":
    case "move":
    case "delete":
      return [operation.targetShapeRef];
    case "connect":
      return [operation.fromShapeRef, operation.toShapeRef];
    case "create_node":
      return [];
  }
};

export const sanitizeCanvasPlanReferences = (
  plan: CanvasPlan,
  scene: CanvasScene,
): CanvasPlan => {
  const knownRefs = new Set(scene.shapes.map((shape) => shape.id));
  const operations: CanvasOperation[] = [];

  for (const operation of plan.operations) {
    if (operation.type === "create_node") {
      operations.push(operation);
      knownRefs.add(operation.tempId);
      continue;
    }

    const refs = getReferencedShapeRefs(operation);
    if (refs.every((ref) => knownRefs.has(ref))) {
      operations.push(operation);
    }
  }

  return {
    summary:
      operations.length > 0
        ? plan.summary
        : "No safe canvas edits were planned.",
    operations,
  };
};

export const buildEmptySceneCanvasFallbackPlan = (
  goal: string,
  scene: CanvasScene,
): CanvasPlan | null => {
  if (scene.shapes.length > 0) {
    return null;
  }

  if (!EMPTY_BOARD_DRAW_KEYWORDS.test(goal)) {
    return null;
  }

  if (LINKED_LIST_KEYWORDS.test(goal)) {
    return {
      summary: "Drew a simple linked list with head and tail labels.",
      operations: [
        {
          type: "create_node",
          tempId: "node_a",
          text: "10",
          shape: "rectangle",
          x: 120,
          y: 180,
          w: 120,
          h: 70,
          color: "blue",
        },
        {
          type: "create_node",
          tempId: "node_b",
          text: "20",
          shape: "rectangle",
          x: 320,
          y: 180,
          w: 120,
          h: 70,
          color: "blue",
        },
        {
          type: "create_node",
          tempId: "node_c",
          text: "30",
          shape: "rectangle",
          x: 520,
          y: 180,
          w: 120,
          h: 70,
          color: "blue",
        },
        {
          type: "connect",
          fromShapeRef: "node_a",
          toShapeRef: "node_b",
          label: "next",
          color: "black",
        },
        {
          type: "connect",
          fromShapeRef: "node_b",
          toShapeRef: "node_c",
          label: "next",
          color: "black",
        },
        {
          type: "annotate",
          targetShapeRef: "node_a",
          text: "Head",
          placement: "above",
          color: "green",
        },
        {
          type: "annotate",
          targetShapeRef: "node_c",
          text: "Tail",
          placement: "above",
          color: "orange",
        },
      ],
    };
  }

  return null;
};

export const enforceGoalDrivenCanvasRequirements = (
  goal: string,
  plan: CanvasPlan,
): CanvasPlan => {
  const labelText = extractExplicitLabelText(goal);
  if (!labelText || planIncludesExplicitLabel(plan, labelText)) {
    return plan;
  }

  const targetShapeRef = getPrimaryTargetShapeRef(plan.operations);
  if (!targetShapeRef) {
    return plan;
  }

  return {
    ...plan,
    operations: [
      ...plan.operations,
      {
        type: "annotate",
        targetShapeRef,
        text: labelText,
        placement: "below",
      },
    ],
  };
};

const buildPlannerPrompt = async ({
  goal,
  context,
  scene,
}: Omit<GenerateCanvasPlanInput, "imageData">) => {
  const skill = await loadCanvasSkill();

  return [
    skill,
    "",
    "Return JSON only.",
    `User goal: ${goal}`,
    context ? `Conversation context: ${context}` : null,
    "",
    "Canvas scene JSON:",
    JSON.stringify(scene),
    "",
    "Important rules:",
    "- Existing shapes must be referenced by their exact scene ids.",
    "- New shapes must use create_node.tempId and later ops may reference that temp id.",
    "- Never reference temp ids like node1 unless you introduced them earlier with create_node.",
    "- If the canvas scene is empty and the user wants something drawn, your first operations must be one or more create_node steps.",
    "- Do not annotate, emphasize, move, delete, or connect a shape ref that has not already been created.",
    "- When highlighting a specific part inside an image or other large shape, use emphasize.region with normalized coordinates relative to the target shape bounds.",
    "- emphasize.region uses x, y, w, h on a 0..1 scale within the target shape. Use it only when the request refers to a sub-region rather than the whole shape.",
    "- Prefer minimal, teachable whiteboard edits.",
    "- Use emphasize for circling, boxing, or highlighting.",
    "- Use annotate for nearby explanatory labels or corrections.",
    "- Use replace_text when fixing wording on an existing shape.",
    "- If the request cannot be completed safely, return an empty operations array.",
  ]
    .filter(Boolean)
    .join("\n");
};

export async function generateCanvasPlan(
  input: GenerateCanvasPlanInput,
): Promise<CanvasPlan> {
  try {
    const ai = getGeminiClient();
    const prompt = await buildPlannerPrompt(input);
    const contents: Array<
      | { text: string }
      | { inlineData: { data: string; mimeType: string } }
    > = [{ text: prompt }];

    if (input.imageData) {
      contents.push({ inlineData: parseDataUrl(input.imageData) });
    }

    const response = await ai.models.generateContent({
      model: GEMINI_CANVAS_PLANNER_MODEL,
      contents,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: CANVAS_PLAN_RESPONSE_JSON_SCHEMA,
        temperature: 0.2,
      },
    });

    if (!response.text) {
      throw new Error("Model returned empty canvas plan");
    }

    const parsed = JSON.parse(response.text);
    const normalizedPlan = normalizeCanvasPlan(parsed);
    const goalDrivenPlan = enforceGoalDrivenCanvasRequirements(
      input.goal,
      normalizedPlan,
    );
    const safePlan = sanitizeCanvasPlanReferences(goalDrivenPlan, input.scene);
    if (safePlan.operations.length > 0) {
      return safePlan;
    }

    const fallbackPlan = buildEmptySceneCanvasFallbackPlan(
      input.goal,
      input.scene,
    );
    return fallbackPlan ?? safePlan;
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Failed to generate canvas plan: ${error.message}`
        : "Failed to generate canvas plan",
    );
  }
}
