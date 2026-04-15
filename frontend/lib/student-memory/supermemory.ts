import "server-only";

import {
  getSupermemoryBaseUrl,
  isStudentMemoryIntegrationEnabled,
  PROFILE_STALE_AFTER_DAYS,
  STUDY_EPISODE_DOWNGRADE_AFTER_DAYS,
  STUDY_EPISODE_EXPIRE_AFTER_DAYS,
} from "@/lib/student-memory/config";
import {
  redactStudentMemoryText,
  isStudentMemorySafeText,
} from "@/lib/student-memory/redaction";
import type {
  ConfirmedProfileMemory,
  DerivedMemoryContext,
  MemoryConfidence,
  StudentProfileMemoryStatus,
  StudentProfileMemoryRecord,
  StudyEpisodeMemoryRecord,
} from "@/types/student-memory";

type SupermemorySyncResult = {
  documentId: string | null;
  success: boolean;
  error: string | null;
};

type SearchResultEntry = {
  id?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  created_at?: string;
};

type SearchResponseBody = {
  results?: SearchResultEntry[];
  memories?: SearchResultEntry[];
  items?: SearchResultEntry[];
};

const getApiKey = () => process.env.SUPERMEMORY_API_KEY?.trim() || "";

const compactJson = (value: unknown) => JSON.stringify(value);

const toTimestamp = (entry: SearchResultEntry) =>
  typeof entry.metadata?.createdAt === "string"
    ? entry.metadata.createdAt
    : typeof entry.createdAt === "string"
      ? entry.createdAt
      : typeof entry.created_at === "string"
        ? entry.created_at
        : null;

const readConfidence = (metadata: Record<string, unknown> | undefined) =>
  metadata?.confidence === "high" ||
  metadata?.confidence === "medium" ||
  metadata?.confidence === "low"
    ? (metadata.confidence as MemoryConfidence)
    : "low";

const confidenceRank = (value: MemoryConfidence) =>
  value === "high" ? 3 : value === "medium" ? 2 : 1;

const ageInDays = (timestamp: string | null) => {
  if (!timestamp) {
    return null;
  }

  const createdAt = new Date(timestamp).getTime();
  if (!Number.isFinite(createdAt)) {
    return null;
  }

  return (Date.now() - createdAt) / (24 * 60 * 60 * 1000);
};

const downgradeConfidence = ({
  confidence,
  timestamp,
}: {
  confidence: MemoryConfidence;
  timestamp: string | null;
}): MemoryConfidence | null => {
  if (!timestamp) {
    return confidence;
  }

  const now = Date.now();
  const createdAt = new Date(timestamp).getTime();
  if (!Number.isFinite(createdAt)) {
    return confidence;
  }

  const ageDays = (now - createdAt) / (24 * 60 * 60 * 1000);
  if (ageDays > STUDY_EPISODE_EXPIRE_AFTER_DAYS) {
    return null;
  }
  if (ageDays > STUDY_EPISODE_DOWNGRADE_AFTER_DAYS) {
    if (confidence === "high") return "medium";
    if (confidence === "medium") return "low";
  }

  return confidence;
};

const getHeaders = () => ({
  Authorization: `Bearer ${getApiKey()}`,
  "Content-Type": "application/json",
});

const isConfigured = () =>
  isStudentMemoryIntegrationEnabled() && getApiKey().length > 0;

async function supermemoryFetch<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(`${getSupermemoryBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...getHeaders(),
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Supermemory request failed (${response.status}): ${errorText || response.statusText}`,
    );
  }

  return (await response.json().catch(() => ({}))) as T;
}

const buildStudyEpisodeContent = (record: StudyEpisodeMemoryRecord) =>
  compactJson({
    summary: redactStudentMemoryText(record.summary),
    focusConceptLabels: record.focusConceptLabels,
    topPointLossRisks: record.topPointLossRisks.map(redactStudentMemoryText).filter(Boolean),
    stableZones: record.stableZones.map(redactStudentMemoryText).filter(Boolean),
    unstableZones: record.unstableZones.map(redactStudentMemoryText).filter(Boolean),
    misconceptionsRemaining: record.misconceptionsRemaining
      .map(redactStudentMemoryText)
      .filter(Boolean),
    recommendedNextDrills: record.recommendedNextDrills
      .map(redactStudentMemoryText)
      .filter(Boolean),
    materialsTouched: record.materialsTouched,
  });

const buildProfileContent = (record: StudentProfileMemoryRecord) =>
  compactJson({
    summary: redactStudentMemoryText(record.summary),
    profileKey: record.profileKey,
    status: record.status,
  });

const buildMetadata = (
  record: StudyEpisodeMemoryRecord | StudentProfileMemoryRecord,
) => ({
  ...record,
  summary: redactStudentMemoryText(record.summary),
});

export async function upsertSupermemoryStudyEpisode(args: {
  customId: string;
  existingDocumentId?: string | null;
  record: StudyEpisodeMemoryRecord;
}): Promise<SupermemorySyncResult> {
  if (!isConfigured() || !isStudentMemorySafeText(args.record.summary)) {
    return {
      documentId: args.existingDocumentId ?? null,
      success: false,
      error: "Supermemory is not configured or payload failed redaction.",
    };
  }

  const body = {
    content: buildStudyEpisodeContent(args.record),
    customId: args.customId,
    containerTags: [`student:${args.record.studentId}:course:${args.record.courseId}`],
    metadata: buildMetadata(args.record),
  };

  try {
    const response = args.existingDocumentId
      ? await supermemoryFetch<{ id?: string }>(
          `/v3/documents/${args.existingDocumentId}`,
          {
            method: "PATCH",
            body: JSON.stringify(body),
          },
        )
      : await supermemoryFetch<{ id?: string }>("/v3/documents", {
          method: "POST",
          body: JSON.stringify(body),
        });

    return {
      documentId: response.id ?? args.existingDocumentId ?? null,
      success: true,
      error: null,
    };
  } catch (error) {
    return {
      documentId: args.existingDocumentId ?? null,
      success: false,
      error: error instanceof Error ? error.message : "Unknown Supermemory error.",
    };
  }
}

export async function upsertSupermemoryProfileMemory(args: {
  customId: string;
  existingDocumentId?: string | null;
  record: StudentProfileMemoryRecord;
}): Promise<SupermemorySyncResult> {
  if (!isConfigured() || !isStudentMemorySafeText(args.record.summary)) {
    return {
      documentId: args.existingDocumentId ?? null,
      success: false,
      error: "Supermemory is not configured or payload failed redaction.",
    };
  }

  const body = {
    content: buildProfileContent(args.record),
    customId: args.customId,
    containerTags: [`student:${args.record.studentId}`],
    metadata: buildMetadata(args.record),
  };

  try {
    const response = args.existingDocumentId
      ? await supermemoryFetch<{ id?: string }>(
          `/v3/documents/${args.existingDocumentId}`,
          {
            method: "PATCH",
            body: JSON.stringify(body),
          },
        )
      : await supermemoryFetch<{ id?: string }>("/v3/documents", {
          method: "POST",
          body: JSON.stringify(body),
        });

    return {
      documentId: response.id ?? args.existingDocumentId ?? null,
      success: true,
      error: null,
    };
  } catch (error) {
    return {
      documentId: args.existingDocumentId ?? null,
      success: false,
      error: error instanceof Error ? error.message : "Unknown Supermemory error.",
    };
  }
}

const toRecentStudyEpisode = (
  entry: SearchResultEntry,
): DerivedMemoryContext["recentStudyEpisodes"][number] | null => {
  const metadata = entry.metadata ?? {};
  if (metadata.memoryType !== "study_episode") {
    return null;
  }

  const timestamp = toTimestamp(entry);
  const confidence = downgradeConfidence({
    confidence: readConfidence(metadata),
    timestamp,
  });

  if (!confidence || confidence === "low") {
    return null;
  }

  return {
    memoryType: "study_episode",
    externalSessionId:
      typeof metadata.externalSessionId === "string"
        ? metadata.externalSessionId
        : typeof metadata.external_session_id === "string"
          ? metadata.external_session_id
          : "",
    trigger:
      metadata.trigger === "quiz_submission" ||
      metadata.trigger === "worksheet_checkpoint" ||
      metadata.trigger === "session_exit"
        ? metadata.trigger
        : "session_exit",
    label:
      typeof metadata.provenance === "string"
        ? `Recent ${String(metadata.provenance).replaceAll("_", " ")}`
        : "Recent study memory",
    summary:
      typeof metadata.summary === "string" ? metadata.summary : "",
    trustClass:
      metadata.trustClass === "authoritative_derived"
        ? "authoritative_derived"
        : "behavioral_inference",
    confidence,
    provenance:
      metadata.provenance === "authoritative_quiz_result" ||
      metadata.provenance === "authoritative_worksheet_checkpoint" ||
      metadata.provenance === "authoritative_session_exit" ||
      metadata.provenance === "derived_profile_update"
        ? metadata.provenance
        : "authoritative_session_exit",
    timestamp,
    focusConceptIds: Array.isArray(metadata.focusConceptIds)
      ? metadata.focusConceptIds.filter((item): item is string => typeof item === "string")
      : [],
    focusConceptLabels: Array.isArray(metadata.focusConceptLabels)
      ? metadata.focusConceptLabels.filter((item): item is string => typeof item === "string")
      : [],
    materialsTouched: Array.isArray(metadata.materialsTouched)
      ? metadata.materialsTouched.flatMap((item) => {
          if (!item || typeof item !== "object") {
            return [];
          }

          const material = item as Record<string, unknown>;
          return typeof material.materialId === "string" &&
            typeof material.title === "string" &&
            typeof material.kind === "string"
            ? [
                {
                  materialId: material.materialId,
                  title: material.title,
                  kind: material.kind,
                },
              ]
            : [];
        })
      : [],
  };
};

const toConfirmedProfileMemory = (
  entry: SearchResultEntry,
): ConfirmedProfileMemory | null => {
  const metadata = entry.metadata ?? {};
  if (metadata.memoryType !== "student_profile") {
    return null;
  }

  const rawStatus =
    metadata.status === "confirmed" ||
    metadata.status === "stale" ||
    metadata.status === "contradicted" ||
    metadata.status === "superseded"
      ? metadata.status
      : null;
  if (!rawStatus || rawStatus === "contradicted" || rawStatus === "superseded") {
    return null;
  }

  const timestamp =
    typeof metadata.lastConfirmedAt === "string"
      ? metadata.lastConfirmedAt
      : toTimestamp(entry);
  const confidence = downgradeConfidence({
    confidence: readConfidence(metadata),
    timestamp,
  });

  if (!confidence) {
    return null;
  }

  const status: StudentProfileMemoryStatus =
    (ageInDays(timestamp) ?? 0) > PROFILE_STALE_AFTER_DAYS ? "stale" : rawStatus;

  return {
    memoryType: "student_profile",
    profileKey:
      typeof metadata.profileKey === "string" ? metadata.profileKey : "",
    label: "Confirmed profile memory",
    summary: typeof metadata.summary === "string" ? metadata.summary : "",
    trustClass:
      metadata.trustClass === "authoritative_derived"
        ? "authoritative_derived"
        : "behavioral_inference",
    confidence,
    provenance:
      metadata.provenance === "authoritative_quiz_result" ||
      metadata.provenance === "authoritative_worksheet_checkpoint" ||
      metadata.provenance === "authoritative_session_exit" ||
      metadata.provenance === "derived_profile_update"
        ? metadata.provenance
        : "derived_profile_update",
    timestamp,
    status,
  };
};

const matchesExam = (metadata: Record<string, unknown>, examId: string | null) => {
  if (!examId) {
    return true;
  }

  return metadata.examId === examId || metadata.exam_id === examId;
};

const searchEntries = async ({
  containerTags,
  limit,
  q,
}: {
  containerTags: string[];
  limit: number;
  q: string;
}) => {
  if (!isConfigured()) {
    return [];
  }

  const response = await supermemoryFetch<SearchResponseBody>("/v3/search", {
    method: "POST",
    body: JSON.stringify({
      q,
      limit,
      containerTags,
    }),
  }).catch(() => null);

  if (!response) {
    return [];
  }

  return response.results ?? response.memories ?? response.items ?? [];
};

export async function retrieveSupermemoryContext(input: {
  studentId: string;
  courseId: string;
  examId: string | null;
  query: string;
}): Promise<DerivedMemoryContext | null> {
  if (!isConfigured()) {
    return null;
  }

  const [episodeEntries, profileEntries] = await Promise.all([
    searchEntries({
      containerTags: [`student:${input.studentId}:course:${input.courseId}`],
      limit: 8,
      q: input.query,
    }),
    searchEntries({
      containerTags: [`student:${input.studentId}`],
      limit: 3,
      q: input.query,
    }),
  ]);

  const recentStudyEpisodes = episodeEntries
    .filter((entry) => matchesExam(entry.metadata ?? {}, input.examId))
    .map(toRecentStudyEpisode)
    .filter(Boolean)
    .sort((left, right) => {
      const leftScore =
        confidenceRank(left!.confidence) +
        (left!.timestamp ? new Date(left!.timestamp).getTime() / 1_000_000_000_000 : 0);
      const rightScore =
        confidenceRank(right!.confidence) +
        (right!.timestamp ? new Date(right!.timestamp).getTime() / 1_000_000_000_000 : 0);
      return rightScore - leftScore;
    })
    .slice(0, 4) as DerivedMemoryContext["recentStudyEpisodes"];
  const confirmedProfileMemory = profileEntries
    .map(toConfirmedProfileMemory)
    .filter(Boolean)
    .sort((left, right) => {
      if (left!.status !== right!.status) {
        return left!.status === "confirmed" ? -1 : 1;
      }

      return sortProfileMemory(left!, right!);
    })
    .slice(0, 1) as DerivedMemoryContext["confirmedProfileMemory"];

  if (recentStudyEpisodes.length === 0 && confirmedProfileMemory.length === 0) {
    return null;
  }

  return {
    recentStudyEpisodes,
    confirmedProfileMemory,
  };
}

function sortProfileMemory(left: ConfirmedProfileMemory, right: ConfirmedProfileMemory) {
  const leftTime = left.timestamp ? new Date(left.timestamp).getTime() : 0;
  const rightTime = right.timestamp ? new Date(right.timestamp).getTime() : 0;

  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return confidenceRank(right.confidence) - confidenceRank(left.confidence);
}
