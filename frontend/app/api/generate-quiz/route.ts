import { NextResponse } from "next/server";
import { z } from "zod";

import { generateQuiz } from "@/lib/gemini/quiz";

const requestSchema = z.object({
  topic: z.string().min(2, "Topic is required"),
  questionCount: z.coerce.number().int().min(3).max(8).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const result = await generateQuiz(body);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const isValidationError = error instanceof z.ZodError;
    const message =
      isValidationError
        ? error.errors.map((entry) => entry.message).join(", ")
        : error instanceof Error
          ? error.message
          : "Failed to generate quiz artifact";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: isValidationError ? 400 : 500 },
    );
  }
}
