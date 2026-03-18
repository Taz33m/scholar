import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getSupabaseAdminClient,
  hasSupabaseAdminConfig,
} from "@/lib/supabase-admin";

export const runtime = "nodejs";

const waitlistEntrySchema = z.object({
  email: z.string().email(),
  createdAt: z.string(),
});

const waitlistPayloadSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
});

const waitlistSchema = z.array(waitlistEntrySchema);

const WAITLIST_PATH =
  process.env.WAITLIST_PATH?.trim() ||
  path.join(process.cwd(), "data", "waitlist.json");

async function readWaitlist() {
  try {
    const raw = await readFile(WAITLIST_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const result = waitlistSchema.safeParse(parsed);

    return result.success ? result.data : [];
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function writeWaitlist(entries: z.infer<typeof waitlistSchema>) {
  await mkdir(path.dirname(WAITLIST_PATH), { recursive: true });
  await writeFile(WAITLIST_PATH, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

async function createWaitlistEntryInSupabase(email: string) {
  const supabase = getSupabaseAdminClient();

  const existingEntry = await supabase
    .from("waitlist_entries")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (existingEntry.error) {
    throw existingEntry.error;
  }

  if (existingEntry.data) {
    return { alreadyJoined: true as const };
  }

  const insertResult = await supabase
    .from("waitlist_entries")
    .insert({ email })
    .select("email")
    .single();

  if (insertResult.error) {
    if (insertResult.error.code === "23505") {
      return { alreadyJoined: true as const };
    }

    throw insertResult.error;
  }

  return { alreadyJoined: false as const };
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Please send a valid email address." }, { status: 400 });
  }

  const result = waitlistPayloadSchema.safeParse(payload);

  if (!result.success) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  const email = result.data.email.toLowerCase();

  if (hasSupabaseAdminConfig()) {
    try {
      const supabaseResult = await createWaitlistEntryInSupabase(email);

      return NextResponse.json(
        { success: true, alreadyJoined: supabaseResult.alreadyJoined },
        { status: supabaseResult.alreadyJoined ? 200 : 201 },
      );
    } catch (error) {
      console.error("[waitlist] supabase write failed", error);
      return NextResponse.json(
        { error: "We couldn't save your email right now. Please try again." },
        { status: 500 },
      );
    }
  }

  const entries = await readWaitlist();

  if (entries.some((entry) => entry.email === email)) {
    return NextResponse.json({ success: true, alreadyJoined: true });
  }

  entries.push({
    email,
    createdAt: new Date().toISOString(),
  });

  await writeWaitlist(entries);

  return NextResponse.json({ success: true, alreadyJoined: false }, { status: 201 });
}
