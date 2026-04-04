import { StudentAccessHttpError } from "@/lib/student-access/http";

type CursorPayload = {
  offset: number;
};

export function decodeCursor(cursor: string | undefined) {
  if (!cursor) {
    return 0;
  }

  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const payload = JSON.parse(decoded) as CursorPayload;

    if (!Number.isInteger(payload.offset) || payload.offset < 0) {
      throw new Error("Invalid cursor offset");
    }

    return payload.offset;
  } catch {
    throw new StudentAccessHttpError(400, "Please provide a valid cursor.");
  }
}

export function encodeCursor(offset: number) {
  return Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url");
}
