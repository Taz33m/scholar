import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { retrieveSupermemoryContext } from "@/lib/student-memory/supermemory";

const createSearchResponse = (items: unknown[]) => ({
  ok: true,
  json: async () => ({ results: items }),
});

beforeEach(() => {
  process.env.STUDENT_MEMORY_ENABLED = "true";
  process.env.SUPERMEMORY_API_KEY = "test-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.STUDENT_MEMORY_ENABLED;
  delete process.env.SUPERMEMORY_API_KEY;
});

describe("supermemory retrieval", () => {
  it("keeps recent high-signal study memory and excludes low-value profile entries", async () => {
    const now = Date.now();
    const recentTimestamp = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
    const staleTimestamp = new Date(now - 70 * 24 * 60 * 60 * 1000).toISOString();
    const expiredTimestamp = new Date(now - 120 * 24 * 60 * 60 * 1000).toISOString();

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        containerTags?: string[];
      };

      if (body.containerTags?.[0] === "student:student-1:course:course-1") {
        return createSearchResponse([
          {
            metadata: {
              memoryType: "study_episode",
              examId: "exam-1",
              externalSessionId: "session-recent",
              trigger: "session_exit",
              summary: "Recent risk was confusing FTC deception with puffery.",
              trustClass: "authoritative_derived",
              confidence: "high",
              provenance: "authoritative_session_exit",
              focusConceptIds: ["bel-ftc-advertising"],
              focusConceptLabels: ["FTC advertising claims"],
              materialsTouched: [],
            },
            createdAt: recentTimestamp,
          },
          {
            metadata: {
              memoryType: "study_episode",
              examId: "exam-1",
              externalSessionId: "session-expired",
              trigger: "session_exit",
              summary: "Old memory that should drop.",
              trustClass: "authoritative_derived",
              confidence: "high",
              provenance: "authoritative_session_exit",
            },
            createdAt: expiredTimestamp,
          },
          {
            metadata: {
              memoryType: "study_episode",
              examId: "exam-1",
              externalSessionId: "session-low",
              trigger: "session_exit",
              summary: "Low confidence memory that should drop.",
              trustClass: "authoritative_derived",
              confidence: "low",
              provenance: "authoritative_session_exit",
            },
            createdAt: recentTimestamp,
          },
        ]);
      }

      return createSearchResponse([
        {
          metadata: {
            memoryType: "student_profile",
            profileKey: "prefers_case_based_drills",
            summary: "Case-based drills are a productive tutoring mode.",
            trustClass: "behavioral_inference",
            confidence: "medium",
            provenance: "derived_profile_update",
            status: "confirmed",
            lastConfirmedAt: recentTimestamp,
          },
          createdAt: recentTimestamp,
        },
        {
          metadata: {
            memoryType: "student_profile",
            profileKey: "old_preference",
            summary: "Older profile memory should go stale.",
            trustClass: "behavioral_inference",
            confidence: "high",
            provenance: "derived_profile_update",
            status: "confirmed",
            lastConfirmedAt: staleTimestamp,
          },
          createdAt: staleTimestamp,
        },
        {
          metadata: {
            memoryType: "student_profile",
            profileKey: "contradicted_preference",
            summary: "Should not be returned.",
            trustClass: "behavioral_inference",
            confidence: "high",
            provenance: "derived_profile_update",
            status: "contradicted",
            lastConfirmedAt: recentTimestamp,
          },
          createdAt: recentTimestamp,
        },
      ]);
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await retrieveSupermemoryContext({
      studentId: "student-1",
      courseId: "course-1",
      examId: "exam-1",
      query: "FTC deception puffery",
    });

    expect(result).toEqual({
      recentStudyEpisodes: [
        expect.objectContaining({
          externalSessionId: "session-recent",
          confidence: "high",
        }),
      ],
      confirmedProfileMemory: [
        expect.objectContaining({
          profileKey: "prefers_case_based_drills",
          status: "confirmed",
        }),
      ],
    });
  });
});
