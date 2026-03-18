import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { canvasSceneSchema } from "@/lib/canvas-plan";
import { generateCanvasPlan } from "@/lib/gemini/canvas-planner";

const requestSchema = z.object({
  goal: z.string().min(2, "Goal must be at least 2 characters"),
  context: z.string().min(2).optional().nullable(),
  scene: canvasSceneSchema,
  imageData: z.string().optional(),
});

type RequestBody = z.infer<typeof requestSchema>;

export async function POST(request: NextRequest) {
  let body: RequestBody;

  try {
    body = requestSchema.parse(await request.json());
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.errors.map((entry) => entry.message).join(", ")
        : "Invalid request body";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 400 },
    );
  }

  if (body.imageData && !body.imageData.startsWith("data:image/")) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid image format",
      },
      { status: 400 },
    );
  }

  try {
    const plan = await generateCanvasPlan({
      goal: body.goal,
      context: body.context ?? undefined,
      scene: body.scene,
      imageData: body.imageData,
    });

    return NextResponse.json({
      success: true,
      plan,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to plan canvas edits";

    console.error("[api] Canvas plan error:", message);

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
