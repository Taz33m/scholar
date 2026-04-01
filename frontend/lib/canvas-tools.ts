import { FunctionDeclaration } from "@google/genai";

import type { CanvasAdapter } from "@/lib/canvas-adapter";
import { playToolCue } from "@/lib/audio";
import { GeminiToolHandler } from "@/lib/flashcard-tools";

export interface CanvasToolContext {
  getCanvasAdapter: () => CanvasAdapter | null;
}

export const CANVAS_FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "get_canvas_snapshot",
    description:
      "Get a detailed description of what is currently drawn on the canvas.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        conversationContext: {
          type: "string",
          description:
            "Optional brief summary of conversation topics to aid interpretation.",
        },
      },
      additionalProperties: false,
    },
  },
];

const getStringArg = (args: Record<string, unknown>, key: string) => {
  const value = args[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const createCanvasToolHandlers = ({
  getCanvasAdapter,
}: CanvasToolContext): Record<string, GeminiToolHandler> => ({
  get_canvas_snapshot: async (args) => {
    const conversationContext = getStringArg(args, "conversationContext");

    try {
      const canvas = getCanvasAdapter();

      if (!canvas?.isReady()) {
        const result = {
          success: false,
          message: "Canvas is not available.",
        };
        playToolCue(result);
        return result;
      }

      const imageData = await canvas.captureImage();

      const response = await fetch("/api/canvas/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageData,
          conversationContext: conversationContext ?? null,
        }),
      });

      const payload = await response.json();

      if (!response.ok || payload.success === false) {
        throw new Error(payload.error ?? "Unable to describe canvas");
      }

      const result = {
        success: true,
        description: payload.description,
        message: `Canvas contains: ${payload.description}`,
      };
      playToolCue(result);
      return result;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";
      const result = {
        success: false,
        message: `Unable to capture canvas snapshot: ${reason}`,
      };
      playToolCue(result);
      return result;
    }
  },
});
