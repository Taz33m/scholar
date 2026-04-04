import { NextResponse } from "next/server";

export const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};

export class StudentAccessHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "StudentAccessHttpError";
    this.status = status;
  }
}

export function jsonErrorResponse(error: unknown) {
  if (error instanceof StudentAccessHttpError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status, headers: NO_STORE_HEADERS },
    );
  }

  console.error("[student-access]", error);

  return NextResponse.json(
    { error: "Something went wrong. Please try again." },
    { status: 500, headers: NO_STORE_HEADERS },
  );
}
