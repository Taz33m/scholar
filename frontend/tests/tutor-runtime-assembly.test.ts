import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audio", () => ({
  playToolCue: vi.fn(),
}));

import { createAdkTools } from "@/lib/adk-tools";
import { mapInternalCourseBrainToPromptCourseBrain, mapSessionStateToPromptStudentState } from "@/lib/tutor-runtime/adapters";
import { assembleTutorPrompt } from "@/lib/tutor-runtime/assemble";
import {
  validatePromptCourseBrain,
  validatePromptStudentState,
} from "@/lib/tutor-runtime/validators";
import type { SessionChecklistItem } from "@/types/course-brain";
import type { FileSessionContext } from "@/types/session";
import type { DerivedMemoryContext } from "@/types/student-memory";
import type { SessionStudyContext } from "@/types/study-context";

const BEL_STUDY_CONTEXT: SessionStudyContext = {
  courseId: "course-bel",
  courseTitle: "Business Ethics and Law",
  courseCode: null,
  examId: "exam-bel-2",
  examTitle: "Exam 2 Review",
  examKind: "midterm",
  examScheduledFor: "2026-04-20T08:00:00.000Z",
  examFocusTopics: [
    "Ethical frameworks and case-based reasoning",
    "Employment discrimination and worker protections",
  ],
  selectedFocusTopics: ["Employment discrimination and worker protections"],
  sessionGoal: "Get fast and accurate on the April 20 exam.",
  courseBrainVersionId: "2026-04-13",
  selectedConceptIds: [
    "bel-employment-discrimination",
    "bel-ethical-frameworks",
  ],
  checklistArtifactId: "checklist-1",
  conceptProgressSnapshot: [
    {
      conceptId: "bel-employment-discrimination",
      conceptName: "Employment discrimination law and worker protections",
      highestDemonstratedBloomLevel: "understand",
      status: "emerging",
      confidenceSignal: 0.38,
      misconceptionSummary: "Confuses ADA accommodation with Title VII treatment claims.",
      evidenceCount: 2,
      lastDemonstratedAt: "2026-04-13T16:30:00.000Z",
      evidenceSummary: "Missed the accommodation hook in a cold-call scenario.",
    },
  ],
  entryPoint: "course_home",
  focusTopic: "Danone case",
};

const ACTIVE_CHECKLIST_ITEMS: SessionChecklistItem[] = [
  {
    id: "bel-employment-discrimination-apply",
    conceptId: "bel-employment-discrimination",
    label: "Employment discrimination law and worker protections",
    bloomLevel: "apply",
    successCriteria: "Apply the right employment statute to a new vignette.",
    status: "in_progress",
    evidenceNote: "Needs cleaner statute selection under pressure.",
  },
];

const DERIVED_MEMORY_CONTEXT: DerivedMemoryContext = {
  recentStudyEpisodes: [
    {
      memoryType: "study_episode",
      externalSessionId: "session-prev-1",
      trigger: "quiz_submission",
      label: "Recent quiz checkpoint",
      summary: "Main point-loss risk was separating Title VII treatment claims from ADA accommodation analysis.",
      trustClass: "authoritative_derived",
      confidence: "high",
      provenance: "authoritative_quiz_result",
      timestamp: "2026-04-13T18:00:00.000Z",
      focusConceptIds: ["bel-employment-discrimination"],
      focusConceptLabels: ["Employment discrimination law and worker protections"],
      materialsTouched: [],
    },
  ],
  confirmedProfileMemory: [
    {
      memoryType: "student_profile",
      profileKey: "prefers_case_based_drills",
      label: "Confirmed profile memory",
      summary: "Case-based drills are a productive tutoring mode for this student.",
      trustClass: "behavioral_inference",
      confidence: "medium",
      provenance: "derived_profile_update",
      timestamp: "2026-04-12T18:00:00.000Z",
      status: "confirmed",
    },
  ],
};

const COURSE_MATERIAL_FILE_CONTEXT: FileSessionContext = {
  artifactId: "artifact-danone",
  title: "Danone: Redefining Corporate Responsibility",
  summary: "CSR and B Corp case.",
  fileName: "danone.pdf",
  mimeType: "application/pdf",
  extractedText: "Core dilemma: can Danone scale stakeholder capitalism credibly?",
  provenance: "course_material",
  materialId: "bel-danone",
  assetUrl: "/course-materials/bel/danone.pdf",
};

const createLiveDeclarations = () =>
  createAdkTools({
    flashcardActions: {
      setCards: vi.fn(),
      setMode: vi.fn(),
      flipCard: vi.fn(),
      nextCard: vi.fn(),
      previousCard: vi.fn(),
    },
    getFlashcardSession: () => ({
      cards: [],
      currentIndex: 0,
      isFlipped: false,
      mode: "idle" as const,
      generatedAt: null,
    }),
    visualizationActions: {
      setVisualization: vi.fn(),
      setMode: vi.fn(),
      clearVisualization: vi.fn(),
    },
    deepDiveActions: {
      setDeepDive: vi.fn(),
      setMode: vi.fn(),
      clearDeepDive: vi.fn(),
    },
    getCanvasAdapter: () => null,
    getQuizContext: () => null,
    getStudyContext: () => BEL_STUDY_CONTEXT,
    getWorksheetContext: () => null,
    getFileContext: () => COURSE_MATERIAL_FILE_CONTEXT,
    setContentView: vi.fn(),
    onOpenCourseMaterial: vi.fn(),
  }).map((tool) => tool.getDeclaration());

describe("tutor runtime assembly", () => {
  it("validates adapted BE&L prompt contracts", () => {
    const promptCourseBrain = mapInternalCourseBrainToPromptCourseBrain({
      studyContext: BEL_STUDY_CONTEXT,
      selectedFileMaterialId: COURSE_MATERIAL_FILE_CONTEXT.materialId,
    });
    const promptStudentState = mapSessionStateToPromptStudentState({
      studyContext: BEL_STUDY_CONTEXT,
      fileContext: COURSE_MATERIAL_FILE_CONTEXT,
      activeChecklistItems: ACTIVE_CHECKLIST_ITEMS,
    });

    expect(promptCourseBrain).not.toBeNull();
    expect(promptStudentState).not.toBeNull();
    expect(validatePromptCourseBrain(promptCourseBrain).valid).toBe(true);
    expect(validatePromptStudentState(promptStudentState).valid).toBe(true);
  });

  it("assembles the prompt in the required order and uses the actual live tool surface", () => {
    const promptCourseBrain = mapInternalCourseBrainToPromptCourseBrain({
      studyContext: BEL_STUDY_CONTEXT,
      selectedFileMaterialId: COURSE_MATERIAL_FILE_CONTEXT.materialId,
    });
    const promptStudentState = mapSessionStateToPromptStudentState({
      studyContext: BEL_STUDY_CONTEXT,
      fileContext: COURSE_MATERIAL_FILE_CONTEXT,
      activeChecklistItems: ACTIVE_CHECKLIST_ITEMS,
    });

    const assembled = assembleTutorPrompt({
      routeKind: "live_voice",
      toolDeclarations: createLiveDeclarations(),
      promptCourseBrain,
      promptStudentState,
      derivedMemoryContext: DERIVED_MEMORY_CONTEXT,
      fileContext: COURSE_MATERIAL_FILE_CONTEXT,
      currentTurnText: "Open the Danone case and test me on the stakeholder dilemma.",
    });

    expect(assembled.report.usedMinimalSafePrompt).toBe(false);
    expect(assembled.report.includedSections).toEqual(
      expect.arrayContaining([
        "base",
        "shell",
        "soul",
        "course_brain",
        "student_state",
        "derived_memory",
        "file_context",
        "tool_surface",
      ]),
    );
    expect(assembled.text.indexOf("Base runtime instructions:")).toBeLessThan(
      assembled.text.indexOf("# shell.md"),
    );
    expect(assembled.text.indexOf("# shell.md")).toBeLessThan(
      assembled.text.indexOf("# soul.md"),
    );
    expect(assembled.text.indexOf("# soul.md")).toBeLessThan(
      assembled.text.indexOf("Active course brain:"),
    );
    expect(assembled.text.indexOf("Active course brain:")).toBeLessThan(
      assembled.text.indexOf("Active student state:"),
    );
    expect(assembled.text.indexOf("Active student state:")).toBeLessThan(
      assembled.text.indexOf("Derived memory context:"),
    );
    expect(assembled.text.indexOf("Derived memory context:")).toBeLessThan(
      assembled.text.indexOf("Route tool surface:"),
    );
    expect(assembled.text).toContain('"name": "open_course_material"');
    expect(assembled.text).toContain(
      '"title": "Danone: Redefining Corporate Responsibility"',
    );
    expect(assembled.text).toContain(
      "Use this block only for personalization and recent study continuity.",
    );
  });

  it("omits the current-file block when no file is selected", () => {
    const promptCourseBrain = mapInternalCourseBrainToPromptCourseBrain({
      studyContext: BEL_STUDY_CONTEXT,
    });
    const promptStudentState = mapSessionStateToPromptStudentState({
      studyContext: BEL_STUDY_CONTEXT,
      fileContext: null,
      activeChecklistItems: ACTIVE_CHECKLIST_ITEMS,
    });

    const assembled = assembleTutorPrompt({
      routeKind: "text_tutor",
      toolDeclarations: [],
      promptCourseBrain,
      promptStudentState,
      derivedMemoryContext: null,
      fileContext: null,
      currentTurnText: "Coach me on discrimination law.",
    });

    expect(assembled.text).not.toContain("Active file context:");
    expect(assembled.text).not.toContain("Derived memory context:");
    expect(assembled.text).not.toContain('"name": "open_course_material"');
    expect(assembled.text).toContain("No live workspace tools are available on this route.");
  });

  it("fails closed to the minimal safe prompt on validation errors", () => {
    const assembled = assembleTutorPrompt({
      routeKind: "text_tutor",
      toolDeclarations: [],
      promptCourseBrain: {
        courseTitle: "Broken",
      } as never,
      promptStudentState: null,
      derivedMemoryContext: null,
      fileContext: null,
      currentTurnText: "Help me study.",
    });

    expect(assembled.report.usedMinimalSafePrompt).toBe(true);
    expect(assembled.text).toContain("Course/state context was unavailable due to validation failure");
    expect(assembled.text).not.toContain("Active course brain:");
  });
});
