import type { SupabaseClient } from "@supabase/supabase-js";

import { STUDENT_MEMORY_CONSENT_VERSION } from "@/lib/student-memory/config";
import type {
  StudentProfileSignalLedgerRecord,
} from "@/lib/student-memory/profile-signals";
import type { StudentMemorySettings } from "@/types/student-memory";

type MemorySettingsRow = {
  memory_opt_in: boolean | null;
  memory_opted_in_at: string | null;
  memory_consent_version: string | null;
};

type ProfileSignalLedgerRow = {
  id: string;
  student_user_id: string;
  profile_key: string;
  family: string;
  summary: string;
  trust_class: "authoritative_derived" | "behavioral_inference";
  confidence: "high" | "medium" | "low";
  status: "candidate" | "confirmed" | "stale" | "contradicted" | "superseded";
  evidence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  last_confirmed_at: string | null;
  source_session_ids: string[] | null;
};

type MemorySyncStatusRow = {
  custom_id: string;
  external_document_id: string | null;
  last_error: string | null;
  last_synced_at: string | null;
  sync_status: string;
};

const isMissingStudentMemoryRelationError = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: unknown; message?: unknown };
  return (
    candidate.code === "PGRST205" ||
    candidate.code === "42P01" ||
    (typeof candidate.message === "string" &&
      (candidate.message.includes("student_profile_signal_ledger") ||
        candidate.message.includes("student_memory_sync_status")))
  );
};

const isMissingStudentMemoryColumnError = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: unknown; message?: unknown };
  return (
    candidate.code === "42703" ||
    (typeof candidate.message === "string" &&
      (candidate.message.includes("memory_opt_in") ||
        candidate.message.includes("memory_opted_in_at") ||
        candidate.message.includes("memory_consent_version")))
  );
};

const toStudentMemorySettings = (row: MemorySettingsRow): StudentMemorySettings => ({
  memoryOptIn: Boolean(row.memory_opt_in),
  memoryOptedInAt: row.memory_opted_in_at ?? null,
  memoryConsentVersion: row.memory_consent_version ?? null,
});

const toProfileSignalRecord = (
  row: ProfileSignalLedgerRow,
): StudentProfileSignalLedgerRecord => ({
  id: row.id,
  studentId: row.student_user_id,
  profileKey: row.profile_key,
  family: row.family,
  summary: row.summary,
  trustClass: row.trust_class,
  confidence: row.confidence,
  status: row.status,
  evidenceCount: row.evidence_count,
  firstSeenAt: row.first_seen_at,
  lastSeenAt: row.last_seen_at,
  lastConfirmedAt: row.last_confirmed_at,
  sourceSessionIds: row.source_session_ids ?? [],
});

export async function getStudentMemorySettings(
  supabase: SupabaseClient,
  studentUserId: string,
): Promise<StudentMemorySettings> {
  const result = await supabase
    .from("app_users")
    .select("memory_opt_in, memory_opted_in_at, memory_consent_version")
    .eq("id", studentUserId)
    .maybeSingle<MemorySettingsRow>();

  if (result.error) {
    if (isMissingStudentMemoryColumnError(result.error)) {
      return toStudentMemorySettings({
        memory_opt_in: false,
        memory_opted_in_at: null,
        memory_consent_version: null,
      });
    }

    throw result.error;
  }

  return toStudentMemorySettings(
    result.data ?? {
      memory_opt_in: false,
      memory_opted_in_at: null,
      memory_consent_version: null,
    },
  );
}

export async function updateStudentMemorySettings(
  supabase: SupabaseClient,
  input: {
    enabled: boolean;
    studentUserId: string;
  },
): Promise<StudentMemorySettings> {
  const now = new Date().toISOString();
  const result = await supabase
    .from("app_users")
    .update({
      memory_opt_in: input.enabled,
      memory_opted_in_at: input.enabled ? now : null,
      memory_consent_version: input.enabled ? STUDENT_MEMORY_CONSENT_VERSION : null,
    })
    .eq("id", input.studentUserId)
    .select("memory_opt_in, memory_opted_in_at, memory_consent_version")
    .single<MemorySettingsRow>();

  if (result.error) {
    if (isMissingStudentMemoryColumnError(result.error)) {
      return toStudentMemorySettings({
        memory_opt_in: input.enabled,
        memory_opted_in_at: input.enabled ? now : null,
        memory_consent_version: input.enabled ? STUDENT_MEMORY_CONSENT_VERSION : null,
      });
    }

    throw result.error;
  }

  return toStudentMemorySettings(result.data);
}

export async function listStudentProfileSignalLedger(
  supabase: SupabaseClient,
  studentUserId: string,
): Promise<StudentProfileSignalLedgerRecord[]> {
  const result = await supabase
    .from("student_profile_signal_ledger")
    .select(
      "id, student_user_id, profile_key, family, summary, trust_class, confidence, status, evidence_count, first_seen_at, last_seen_at, last_confirmed_at, source_session_ids",
    )
    .eq("student_user_id", studentUserId)
    .order("last_seen_at", { ascending: false });

  if (result.error) {
    if (isMissingStudentMemoryRelationError(result.error)) {
      return [];
    }

    throw result.error;
  }

  return ((result.data ?? []) as ProfileSignalLedgerRow[]).map(
    toProfileSignalRecord,
  );
}

export async function replaceStudentProfileSignalLedger(
  supabase: SupabaseClient,
  studentUserId: string,
  ledger: StudentProfileSignalLedgerRecord[],
) {
  try {
    const deleteResult = await supabase
      .from("student_profile_signal_ledger")
      .delete()
      .eq("student_user_id", studentUserId);

    if (deleteResult.error) {
      throw deleteResult.error;
    }

    if (ledger.length === 0) {
      return;
    }

    const insertResult = await supabase
      .from("student_profile_signal_ledger")
      .insert(
        ledger.map((entry) => ({
          student_user_id: studentUserId,
          profile_key: entry.profileKey,
          family: entry.family,
          summary: entry.summary,
          trust_class: entry.trustClass,
          confidence: entry.confidence,
          status: entry.status,
          evidence_count: entry.evidenceCount,
          first_seen_at: entry.firstSeenAt,
          last_seen_at: entry.lastSeenAt,
          last_confirmed_at: entry.lastConfirmedAt,
          source_session_ids: entry.sourceSessionIds,
        })),
      );

    if (insertResult.error) {
      throw insertResult.error;
    }
  } catch (error) {
    if (isMissingStudentMemoryRelationError(error)) {
      return;
    }

    throw error;
  }
}

export async function getStudentMemorySyncStatus(
  supabase: SupabaseClient,
  studentUserId: string,
  customId: string,
): Promise<MemorySyncStatusRow | null> {
  const result = await supabase
    .from("student_memory_sync_status")
    .select(
      "custom_id, external_document_id, last_error, last_synced_at, sync_status",
    )
    .eq("student_user_id", studentUserId)
    .eq("custom_id", customId)
    .maybeSingle<MemorySyncStatusRow>();

  if (result.error) {
    if (isMissingStudentMemoryRelationError(result.error)) {
      return null;
    }

    throw result.error;
  }

  return result.data ?? null;
}

export async function upsertStudentMemorySyncStatus(
  supabase: SupabaseClient,
  input: {
    customId: string;
    externalDocumentId: string | null;
    lastError: string | null;
    memoryType: "study_episode" | "student_profile";
    studentUserId: string;
    syncStatus: "synced" | "failed";
  },
) {
  try {
    const result = await supabase.from("student_memory_sync_status").upsert(
      {
        custom_id: input.customId,
        external_document_id: input.externalDocumentId,
        last_error: input.lastError,
        last_synced_at: new Date().toISOString(),
        memory_type: input.memoryType,
        student_user_id: input.studentUserId,
        sync_status: input.syncStatus,
      },
      {
        onConflict: "student_user_id,custom_id",
      },
    );

    if (result.error) {
      throw result.error;
    }
  } catch (error) {
    if (isMissingStudentMemoryRelationError(error)) {
      return;
    }

    throw error;
  }
}
