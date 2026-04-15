import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  getStudentMemorySyncStatusMock,
  listStudentProfileSignalLedgerMock,
  replaceStudentProfileSignalLedgerMock,
  upsertStudentMemorySyncStatusMock,
  upsertSupermemoryProfileMemoryMock,
  upsertSupermemoryStudyEpisodeMock,
} = vi.hoisted(() => ({
  getStudentMemorySyncStatusMock: vi.fn(),
  listStudentProfileSignalLedgerMock: vi.fn(),
  replaceStudentProfileSignalLedgerMock: vi.fn(),
  upsertStudentMemorySyncStatusMock: vi.fn(),
  upsertSupermemoryProfileMemoryMock: vi.fn(),
  upsertSupermemoryStudyEpisodeMock: vi.fn(),
}));

vi.mock("@/lib/student-memory/repository", () => ({
  getStudentMemorySyncStatus: getStudentMemorySyncStatusMock,
  listStudentProfileSignalLedger: listStudentProfileSignalLedgerMock,
  replaceStudentProfileSignalLedger: replaceStudentProfileSignalLedgerMock,
  upsertStudentMemorySyncStatus: upsertStudentMemorySyncStatusMock,
}));

vi.mock("@/lib/student-memory/supermemory", () => ({
  retrieveSupermemoryContext: vi.fn(),
  upsertSupermemoryProfileMemory: upsertSupermemoryProfileMemoryMock,
  upsertSupermemoryStudyEpisode: upsertSupermemoryStudyEpisodeMock,
}));

import { getCourseBrainForCourse } from "@/lib/course-brain";
import { syncStudyEpisodeMemory } from "@/lib/student-memory/service";

const courseBrain = getCourseBrainForCourse({
  courseSlug: "business-ethics-and-law",
  courseTitle: "Business Ethics and Law",
  examTitle: "Exam 2 Review",
});

describe("student memory service", () => {
  beforeEach(() => {
    getStudentMemorySyncStatusMock.mockReset();
    listStudentProfileSignalLedgerMock.mockReset();
    replaceStudentProfileSignalLedgerMock.mockReset();
    upsertStudentMemorySyncStatusMock.mockReset();
    upsertSupermemoryProfileMemoryMock.mockReset();
    upsertSupermemoryStudyEpisodeMock.mockReset();

    upsertSupermemoryStudyEpisodeMock.mockResolvedValue({
      documentId: "study-doc-1",
      success: true,
      error: null,
    });
    upsertSupermemoryProfileMemoryMock.mockResolvedValue({
      documentId: "profile-doc-1",
      success: true,
      error: null,
    });
    replaceStudentProfileSignalLedgerMock.mockResolvedValue(undefined);
    upsertStudentMemorySyncStatusMock.mockResolvedValue(undefined);
  });

  it("does nothing when the student has not opted into memory-enhanced tutoring", async () => {
    await syncStudyEpisodeMemory({
      courseBrain: courseBrain!,
      evaluation: {
        checklistArtifact: {} as never,
        conceptProgressSnapshot: [],
        nextRecommendedConceptIds: [],
        misconceptionsFound: [],
        learningEvidence: [],
      },
      materialsTouched: [],
      sessionGoal: "General review.",
      sessionId: "session-1",
      settings: {
        memoryOptIn: false,
        memoryOptedInAt: null,
        memoryConsentVersion: null,
      },
      studentId: "student-1",
      courseId: "course-1",
      examId: "exam-1",
      supabase: {} as never,
      trigger: "session_exit",
      wroteAt: "2026-04-14T18:00:00.000Z",
    });

    expect(upsertSupermemoryStudyEpisodeMock).not.toHaveBeenCalled();
    expect(listStudentProfileSignalLedgerMock).not.toHaveBeenCalled();
  });

  it("writes a study episode and promotes a repeated profile signal to confirmed", async () => {
    const concept = courseBrain!.concepts[0]!;
    getStudentMemorySyncStatusMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    listStudentProfileSignalLedgerMock.mockResolvedValue([
      {
        studentId: "student-1",
        profileKey: "prefers_case_based_drills",
        family: "drill_preference",
        summary: "Case-based drills are a productive tutoring mode for this student.",
        trustClass: "behavioral_inference",
        confidence: "medium",
        status: "candidate",
        evidenceCount: 1,
        firstSeenAt: "2026-04-01T18:00:00.000Z",
        lastSeenAt: "2026-04-01T18:00:00.000Z",
        lastConfirmedAt: null,
        sourceSessionIds: ["session-0"],
      },
    ]);

    await syncStudyEpisodeMemory({
      courseBrain: courseBrain!,
      evaluation: {
        checklistArtifact: {} as never,
        conceptProgressSnapshot: [
          {
            conceptId: concept.id,
            conceptName: concept.label,
            highestDemonstratedBloomLevel: "understand",
            status: "emerging",
            confidenceSignal: 0.4,
            misconceptionSummary: "Needs a cleaner distinction under pressure.",
            evidenceCount: 2,
            lastDemonstratedAt: "2026-04-14T17:55:00.000Z",
            evidenceSummary: "Missed the faster classification step in a timed question.",
          },
        ],
        nextRecommendedConceptIds: [concept.id],
        misconceptionsFound: ["Needs a cleaner distinction under pressure."],
        learningEvidence: [],
      },
      materialsTouched: [
        {
          materialId: "bel-danone",
          title: "Danone: Redefining Corporate Responsibility",
          sourceKind: "case",
        },
      ],
      sessionGoal: "Timed case practice under time pressure.",
      sessionId: "session-2",
      settings: {
        memoryOptIn: true,
        memoryOptedInAt: "2026-04-10T18:00:00.000Z",
        memoryConsentVersion: "2026-04-supermemory-v1",
      },
      studentId: "student-1",
      courseId: "course-1",
      examId: "exam-1",
      supabase: {} as never,
      trigger: "session_exit",
      wroteAt: "2026-04-14T18:00:00.000Z",
    });

    expect(upsertSupermemoryStudyEpisodeMock).toHaveBeenCalledOnce();
    expect(replaceStudentProfileSignalLedgerMock).toHaveBeenCalledOnce();
    expect(upsertSupermemoryProfileMemoryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customId: "profile:student-1:prefers_case_based_drills",
        record: expect.objectContaining({
          profileKey: "prefers_case_based_drills",
          status: "confirmed",
        }),
      }),
    );
  });
});
