import { NextResponse } from "next/server";
import { z } from "zod";

import { generateWorksheet } from "@/lib/gemini/worksheet";
import { studyContextRequestSchema } from "@/lib/study-context-schema";

const requestSchema = z.object({
  topic: z.string().min(2, "Topic is required"),
  focus: z.string().min(2).optional(),
  questionCount: z.coerce.number().int().min(3).max(10).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  studyContext: studyContextRequestSchema,
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const result = await generateWorksheet(body);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const isValidationError = error instanceof z.ZodError;
    const message = isValidationError
      ? error.errors.map((entry) => entry.message).join(", ")
      : error instanceof Error
        ? error.message
        : "Failed to generate worksheet artifact";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: isValidationError ? 400 : 500 },
    );
  }
}
