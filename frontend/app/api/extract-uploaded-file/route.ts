import { NextResponse } from "next/server";
import { z } from "zod";

import { extractUploadedFileContext } from "@/lib/gemini/uploaded-file";

const requestSchema = z.object({
  dataBase64: z.string().min(20, "File payload is required"),
  fileName: z.string().min(1, "File name is required"),
  mimeType: z.string().min(1, "File type is required"),
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const result = await extractUploadedFileContext(body);

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
        : "Failed to analyze uploaded file";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: isValidationError ? 400 : 500 },
    );
  }
}
