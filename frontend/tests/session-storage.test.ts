import { afterEach, describe, expect, it, vi } from "vitest";

import {
  consumePendingTutorSessionSeed,
  loadSessionTranscript,
  loadTutorSessions,
  queuePendingTutorSessionSeed,
  runLegacyTranscriptMaintenance,
  saveSessionTranscript,
  saveTutorSessions,
} from "@/lib/session-storage";
import type { TutorSession } from "@/types/session";

const createMemoryStorage = () => {
  const store = new Map<string, string>();

  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("session storage", () => {
  it("persists active tab and quiz snapshot state", () => {
    const localStorage = createMemoryStorage();
    vi.stubGlobal("window", { localStorage });

    const session: TutorSession = {
      id: "session-1",
      title: "Session 1",
      summary: "Quiz in progress.",
      status: "active",
      studyContext: null,
      createdAt: new Date("2026-03-10T10:00:00.000Z"),
      updatedAt: new Date("2026-03-10T10:05:00.000Z"),
      endedAt: null,
      events: [],
      artifacts: [],
      snapshot: {
        contentView: "flashcards",
        activeTab: "quiz",
        flashcardSession: {
          cards: [],
          currentIndex: 0,
          isFlipped: false,
          mode: "idle",
          generatedAt: null,
        },
        visualizationState: {
          imageData: null,
          description: null,
          generatedAt: null,
          mode: "idle",
        },
        deepDiveState: {
          imageData: null,
          overviewText: null,
          topic: null,
          generatedAt: null,
          mode: "idle",
        },
        quizState: {
          selections: {
            0: "B",
            2: "A",
          },
          isSubmitted: true,
        },
        worksheetState: {
          activeWorksheetArtifactId: null,
          responsesByArtifactId: {},
        },
        fileState: {
          activeFileArtifactId: null,
        },
        transcript: [
          {
            id: "transcript-1",
            role: "assistant",
            text: "Let us review the first concept.",
            timestamp: new Date("2026-03-10T10:02:00.000Z"),
          },
        ],
      },
    };

    saveSessionTranscript("session-1", session.snapshot.transcript);
    saveTutorSessions([session]);
    const [loaded] = loadTutorSessions();

    expect(loaded.snapshot.activeTab).toBe("quiz");
    expect(loaded.snapshot.quizState).toEqual({
      selections: {
        0: "B",
        2: "A",
      },
      isSubmitted: true,
    });
    expect(loaded.snapshot.worksheetState).toEqual({
      activeWorksheetArtifactId: null,
      responsesByArtifactId: {},
    });
    expect(loaded.snapshot.transcript).toEqual([]);
    expect(loadSessionTranscript("session-1")).toEqual([
      {
        id: "transcript-1",
        role: "assistant",
        text: "Let us review the first concept.",
        timestamp: new Date("2026-03-10T10:02:00.000Z"),
      },
    ]);
  });

  it("normalizes missing quiz snapshot and invalid active tab from older sessions", () => {
    const localStorage = createMemoryStorage();
    vi.stubGlobal("window", { localStorage });

    localStorage.setItem(
      "geminilearn.sessions.v1",
      JSON.stringify([
        {
          id: "legacy-session",
          title: "Legacy Session",
          summary: "",
          status: "active",
          createdAt: "2026-03-10T10:00:00.000Z",
          updatedAt: "2026-03-10T10:05:00.000Z",
          endedAt: null,
          events: [],
          artifacts: [],
          snapshot: {
            contentView: "flashcards",
            activeTab: "not-a-real-tab",
            flashcardSession: {
              cards: [],
              currentIndex: 0,
              isFlipped: false,
              mode: "idle",
              generatedAt: null,
            },
            visualizationState: {
              imageData: null,
              description: null,
              generatedAt: null,
              mode: "idle",
            },
            deepDiveState: {
              imageData: null,
              overviewText: null,
              topic: null,
              generatedAt: null,
              mode: "idle",
            },
            uploadedFileState: {
              activeUploadedFileArtifactId: "legacy-file-id",
            },
          },
        },
      ]),
    );

    const [loaded] = loadTutorSessions();

    expect(loaded.snapshot.activeTab).toBe("flashcards");
    expect(loaded.snapshot.quizState).toEqual({
      selections: {},
      isSubmitted: false,
    });
    expect(loaded.snapshot.worksheetState).toEqual({
      activeWorksheetArtifactId: null,
      responsesByArtifactId: {},
    });
    expect(loaded.snapshot.fileState).toEqual({
      activeFileArtifactId: "legacy-file-id",
    });
    expect(loaded.snapshot.transcript).toEqual([]);
  });

  it("normalizes course material file artifacts alongside the new file snapshot state", () => {
    const localStorage = createMemoryStorage();
    vi.stubGlobal("window", { localStorage });

    localStorage.setItem(
      "geminilearn.sessions.v1",
      JSON.stringify([
        {
          id: "course-material-session",
          title: "Course Material Session",
          summary: "Reviewing the Danone case.",
          status: "active",
          createdAt: "2026-04-14T10:00:00.000Z",
          updatedAt: "2026-04-14T10:05:00.000Z",
          endedAt: null,
          events: [],
          artifacts: [
            {
              id: "artifact-case",
              type: "course_material_file",
              title: "Danone: Redefining Corporate Responsibility",
              createdAt: "2026-04-14T10:01:00.000Z",
              summary: "CSR case packet.",
              fileName: "danone.pdf",
              mimeType: "application/pdf",
              extractedText:
                "Core dilemma: whether Danone can scale stakeholder commitments.",
              materialId: "bel-danone",
              sourceKind: "case",
              courseBrainVersionId: "2026-04-13",
              assetUrl: "/course-materials/bel/danone.pdf",
            },
          ],
          snapshot: {
            contentView: "flashcards",
            activeTab: "file",
            flashcardSession: {
              cards: [],
              currentIndex: 0,
              isFlipped: false,
              mode: "idle",
              generatedAt: null,
            },
            visualizationState: {
              imageData: null,
              description: null,
              generatedAt: null,
              mode: "idle",
            },
            deepDiveState: {
              imageData: null,
              overviewText: null,
              topic: null,
              generatedAt: null,
              mode: "idle",
            },
            quizState: {
              selections: {},
              isSubmitted: false,
            },
            worksheetState: {
              activeWorksheetArtifactId: null,
              responsesByArtifactId: {},
            },
            fileState: {
              activeFileArtifactId: "artifact-case",
            },
          },
        },
      ]),
    );

    const [loaded] = loadTutorSessions();

    expect(loaded.snapshot.fileState).toEqual({
      activeFileArtifactId: "artifact-case",
    });
    expect(loaded.artifacts[0]).toMatchObject({
      type: "course_material_file",
      materialId: "bel-danone",
      provenance: "course_material",
      assetUrl: "/course-materials/bel/danone.pdf",
    });
  });

  it("round-trips derived memory context through session storage", () => {
    const localStorage = createMemoryStorage();
    vi.stubGlobal("window", { localStorage });

    saveTutorSessions([
      {
        id: "memory-session",
        title: "Memory Session",
        summary: "Testing derived memory persistence.",
        status: "active",
        studyContext: {
          courseId: "course-bel",
          courseTitle: "Business Ethics and Law",
          courseCode: null,
          examId: "exam-bel-2",
          examTitle: "Exam 2 Review",
          examKind: "midterm",
          examScheduledFor: "2026-04-20T08:00:00.000Z",
          examFocusTopics: [],
          selectedFocusTopics: [],
          sessionGoal: "Get faster on ethics questions.",
          derivedMemoryContext: {
            recentStudyEpisodes: [
              {
                memoryType: "study_episode",
                externalSessionId: "prev-1",
                trigger: "session_exit",
                label: "Recent session exit",
                summary: "Recent risk was separating FTC deception from puffery.",
                trustClass: "authoritative_derived",
                confidence: "high",
                provenance: "authoritative_session_exit",
                timestamp: "2026-04-13T18:30:00.000Z",
                focusConceptIds: ["bel-ftc-advertising"],
                focusConceptLabels: [
                  "FTC advertising claims, deception, and due care",
                ],
                materialsTouched: [],
              },
            ],
            confirmedProfileMemory: [
              {
                memoryType: "student_profile",
                profileKey: "prefers_case_based_drills",
                label: "Confirmed profile memory",
                summary: "Case-based drills are productive for this student.",
                trustClass: "behavioral_inference",
                confidence: "medium",
                provenance: "derived_profile_update",
                timestamp: "2026-04-12T18:30:00.000Z",
                status: "confirmed",
              },
            ],
          },
        },
        createdAt: new Date("2026-04-14T10:00:00.000Z"),
        updatedAt: new Date("2026-04-14T10:05:00.000Z"),
        endedAt: null,
        events: [],
        artifacts: [],
        snapshot: {
          contentView: "flashcards",
          activeTab: "flashcards",
          flashcardSession: {
            cards: [],
            currentIndex: 0,
            isFlipped: false,
            mode: "idle",
            generatedAt: null,
          },
          visualizationState: {
            imageData: null,
            description: null,
            generatedAt: null,
            mode: "idle",
          },
          deepDiveState: {
            imageData: null,
            overviewText: null,
            topic: null,
            generatedAt: null,
            mode: "idle",
          },
          quizState: {
            selections: {},
            isSubmitted: false,
          },
          worksheetState: {
            activeWorksheetArtifactId: null,
            responsesByArtifactId: {},
          },
          fileState: {
            activeFileArtifactId: null,
          },
          transcript: [],
        },
      },
    ]);

    const [loaded] = loadTutorSessions();

    expect(loaded.studyContext?.derivedMemoryContext).toEqual({
      recentStudyEpisodes: [
        {
          memoryType: "study_episode",
          externalSessionId: "prev-1",
          trigger: "session_exit",
          label: "Recent session exit",
          summary: "Recent risk was separating FTC deception from puffery.",
          trustClass: "authoritative_derived",
          confidence: "high",
          provenance: "authoritative_session_exit",
          timestamp: "2026-04-13T18:30:00.000Z",
          focusConceptIds: ["bel-ftc-advertising"],
          focusConceptLabels: [
            "FTC advertising claims, deception, and due care",
          ],
          materialsTouched: [],
        },
      ],
      confirmedProfileMemory: [
        {
          memoryType: "student_profile",
          profileKey: "prefers_case_based_drills",
          label: "Confirmed profile memory",
          summary: "Case-based drills are productive for this student.",
          trustClass: "behavioral_inference",
          confidence: "medium",
          provenance: "derived_profile_update",
          timestamp: "2026-04-12T18:30:00.000Z",
          status: "confirmed",
        },
      ],
    });
  });

  it("persists worksheet artifacts and worksheet response state", () => {
    const localStorage = createMemoryStorage();
    vi.stubGlobal("window", { localStorage });

    const session: TutorSession = {
      id: "worksheet-session",
      title: "Worksheet Session",
      summary: "Worksheet practice in progress.",
      status: "active",
      studyContext: null,
      createdAt: new Date("2026-03-10T10:00:00.000Z"),
      updatedAt: new Date("2026-03-10T10:10:00.000Z"),
      endedAt: null,
      events: [],
      artifacts: [
        {
          id: "worksheet-1",
          type: "worksheet",
          title: "Stoichiometry Worksheet",
          createdAt: new Date("2026-03-10T10:02:00.000Z"),
          summary: "Balanced equations and mole ratios.",
          instructions: "Show your work where needed.",
          estimatedTimeMinutes: 20,
          difficulty: "medium",
          document: {
            subtitle: "Chemistry Unit 4",
            learningObjectives: ["Interpret mole ratios"],
            sections: [
              {
                id: "section-1",
                heading: "Reaction Review",
                directions: "Answer all questions.",
                items: [
                  {
                    kind: "multiple_choice",
                    questionId: "question-1",
                    prompt: "Which coefficient balances H2 + O2 -> H2O?",
                    choices: [
                      { id: "choice-1", label: "A", text: "1, 1, 1" },
                      { id: "choice-2", label: "B", text: "2, 1, 2" },
                      { id: "choice-3", label: "C", text: "2, 2, 2" },
                    ],
                  },
                ],
              },
            ],
          },
          answerKey: [
            {
              questionId: "question-1",
              answerText: "B. 2, 1, 2",
              explanation: "That is the balanced equation.",
            },
          ],
        },
      ],
      snapshot: {
        contentView: "flashcards",
        activeTab: "worksheet",
        flashcardSession: {
          cards: [],
          currentIndex: 0,
          isFlipped: false,
          mode: "idle",
          generatedAt: null,
        },
        visualizationState: {
          imageData: null,
          description: null,
          generatedAt: null,
          mode: "idle",
        },
        deepDiveState: {
          imageData: null,
          overviewText: null,
          topic: null,
          generatedAt: null,
          mode: "idle",
        },
        quizState: {
          selections: {},
          isSubmitted: false,
        },
        worksheetState: {
          activeWorksheetArtifactId: "worksheet-1",
          responsesByArtifactId: {
            "worksheet-1": {
              "question-1": {
                kind: "multiple_choice",
                selectedOptionId: "choice-2",
                note: "Remember diatomic oxygen.",
              },
            },
          },
        },
        fileState: {
          activeFileArtifactId: null,
        },
        transcript: [],
      },
    };

    saveTutorSessions([session]);
    const [loaded] = loadTutorSessions();
    const worksheet = loaded.artifacts[0];

    expect(loaded.snapshot.activeTab).toBe("worksheet");
    expect(loaded.snapshot.worksheetState).toEqual({
      activeWorksheetArtifactId: "worksheet-1",
      responsesByArtifactId: {
        "worksheet-1": {
          "question-1": {
            kind: "multiple_choice",
            selectedOptionId: "choice-2",
            note: "Remember diatomic oxygen.",
          },
        },
      },
    });
    expect(worksheet).toMatchObject({
      type: "worksheet",
      title: "Stoichiometry Worksheet",
    });
  });

  it("omits transcript payloads from the main session blob when saving", () => {
    const localStorage = createMemoryStorage();
    vi.stubGlobal("window", { localStorage });

    const session: TutorSession = {
      id: "session-transcript-strip",
      title: "Session",
      summary: "",
      status: "active",
      studyContext: null,
      createdAt: new Date("2026-03-10T10:00:00.000Z"),
      updatedAt: new Date("2026-03-10T10:05:00.000Z"),
      endedAt: null,
      events: [],
      artifacts: [],
      snapshot: {
        contentView: "flashcards",
        activeTab: "flashcards",
        flashcardSession: {
          cards: [],
          currentIndex: 0,
          isFlipped: false,
          mode: "idle",
          generatedAt: null,
        },
        visualizationState: {
          imageData: null,
          description: null,
          generatedAt: null,
          mode: "idle",
        },
        deepDiveState: {
          imageData: null,
          overviewText: null,
          topic: null,
          generatedAt: null,
          mode: "idle",
        },
        quizState: {
          selections: {},
          isSubmitted: false,
        },
        worksheetState: {
          activeWorksheetArtifactId: null,
          responsesByArtifactId: {},
        },
        fileState: {
          activeFileArtifactId: null,
        },
        transcript: [
          {
            id: "transcript-1",
            role: "assistant",
            text: "Transcript should stay out of the main blob.",
            timestamp: new Date("2026-03-10T10:02:00.000Z"),
          },
        ],
      },
    };

    saveTutorSessions([session]);

    expect(localStorage.getItem("geminilearn.sessions.v1")).not.toContain("\"transcript\"");
  });

  it("keeps legacy inline transcripts in memory until background maintenance runs", () => {
    const localStorage = createMemoryStorage();
    vi.stubGlobal("window", { localStorage });

    localStorage.setItem(
      "geminilearn.sessions.v1",
      JSON.stringify([
        {
          id: "legacy-inline-transcript",
          title: "Legacy Inline Transcript",
          summary: "",
          status: "active",
          createdAt: "2026-03-10T10:00:00.000Z",
          updatedAt: "2026-03-10T10:05:00.000Z",
          endedAt: null,
          events: [],
          artifacts: [],
          snapshot: {
            contentView: "flashcards",
            activeTab: "flashcards",
            flashcardSession: {
              cards: [],
              currentIndex: 0,
              isFlipped: false,
              mode: "idle",
              generatedAt: null,
            },
            visualizationState: {
              imageData: null,
              description: null,
              generatedAt: null,
              mode: "idle",
            },
            deepDiveState: {
              imageData: null,
              overviewText: null,
              topic: null,
              generatedAt: null,
              mode: "idle",
            },
            quizState: {
              selections: {},
              isSubmitted: false,
            },
            worksheetState: {
              activeWorksheetArtifactId: null,
              responsesByArtifactId: {},
            },
            fileState: {
              activeFileArtifactId: null,
            },
            transcript: [
              {
                id: "transcript-legacy-1",
                role: "assistant",
                text: "This should not be migrated during load.",
                timestamp: "2026-03-10T10:02:00.000Z",
              },
            ],
          },
        },
      ]),
    );

    const [loaded] = loadTutorSessions();

    expect(loaded.snapshot.transcript).toEqual([
      {
        id: "transcript-legacy-1",
        role: "assistant",
        text: "This should not be migrated during load.",
        timestamp: new Date("2026-03-10T10:02:00.000Z"),
      },
    ]);
    expect(loadSessionTranscript("legacy-inline-transcript")).toEqual([]);

    runLegacyTranscriptMaintenance();

    expect(loadSessionTranscript("legacy-inline-transcript")).toEqual([
      {
        id: "transcript-legacy-1",
        role: "assistant",
        text: "This should not be migrated during load.",
        timestamp: new Date("2026-03-10T10:02:00.000Z"),
      },
    ]);
    expect(localStorage.getItem("geminilearn.sessions.v1")).not.toContain("\"transcript\"");
  });

  it("queues and consumes pending tutor session seeds", () => {
    const localStorage = createMemoryStorage();
    const sessionStorage = createMemoryStorage();
    vi.stubGlobal("window", { localStorage, sessionStorage });

    queuePendingTutorSessionSeed({
      id: "session-queued",
      title: "Marketing Session",
    });

    expect(consumePendingTutorSessionSeed("session-queued")).toEqual({
      createdAt: expect.any(String),
      id: "session-queued",
      studyContext: null,
      title: "Marketing Session",
    });
    expect(consumePendingTutorSessionSeed("session-queued")).toBeNull();
  });

  it("preserves checklist artifacts in pending tutor session seeds", () => {
    const localStorage = createMemoryStorage();
    const sessionStorage = createMemoryStorage();
    vi.stubGlobal("window", { localStorage, sessionStorage });

    queuePendingTutorSessionSeed({
      id: "session-checklist",
      artifacts: [
        {
          id: "checklist-session-checklist",
          type: "session_checklist",
          title: "Checklist",
          createdAt: new Date("2026-04-13T15:30:00.000Z"),
          summary: "Session objectives aligned to Exam 2 Review.",
          courseBrainVersionId: "2026-04-13",
          items: [
            {
              id: "bel-ftc-advertising-apply",
              conceptId: "bel-ftc-advertising",
              label: "FTC advertising claims, deception, and due care",
              bloomLevel: "apply",
              successCriteria: "Apply the FTC claim rules to a course-style example.",
              status: "in_progress",
              evidenceNote: "Working through claim classification.",
            },
          ],
        },
      ],
    });

    expect(consumePendingTutorSessionSeed("session-checklist")).toEqual({
      createdAt: expect.any(String),
      id: "session-checklist",
      artifacts: [
        {
          id: "checklist-session-checklist",
          type: "session_checklist",
          title: "Checklist",
          createdAt: new Date("2026-04-13T15:30:00.000Z"),
          summary: "Session objectives aligned to Exam 2 Review.",
          courseBrainVersionId: "2026-04-13",
          items: [
            {
              id: "bel-ftc-advertising-apply",
              conceptId: "bel-ftc-advertising",
              label: "FTC advertising claims, deception, and due care",
              bloomLevel: "apply",
              successCriteria: "Apply the FTC claim rules to a course-style example.",
              status: "in_progress",
              evidenceNote: "Working through claim classification.",
            },
          ],
        },
      ],
      studyContext: null,
      title: undefined,
    });
  });
});
