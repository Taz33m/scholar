import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audio", () => ({
  playToolCue: vi.fn(),
}));

import {
  listOpenableCourseMaterialsForStudyContext,
  resolveCourseMaterialForStudyContext,
} from "@/lib/course-materials";
import { createAdkTools } from "@/lib/adk-tools";
import type { FileSessionContext } from "@/types/session";
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
  selectedFocusTopics: [],
  sessionGoal: "Prepare for the April 20 exam.",
  courseBrainVersionId: "2026-04-13",
  selectedConceptIds: ["bel-ethical-frameworks", "bel-employment-discrimination"],
  checklistArtifactId: "checklist-1",
  conceptProgressSnapshot: [],
  entryPoint: "course_home",
  focusTopic: null,
};

const createToolSet = ({
  fileContext = null,
  onOpenCourseMaterial,
}: {
  fileContext?: FileSessionContext | null;
  onOpenCourseMaterial?: ReturnType<typeof vi.fn>;
} = {}) =>
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
      mode: "idle",
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
    getFileContext: () => fileContext,
    setContentView: vi.fn(),
    onOpenCourseMaterial,
  });

describe("course material registry", () => {
  it("lists only PDF-friendly materials as openable for BE&L", () => {
    const materials = listOpenableCourseMaterialsForStudyContext(BEL_STUDY_CONTEXT);

    expect(materials.length).toBeGreaterThanOrEqual(6);
    expect(materials.map((material) => material.materialId)).toContain("bel-danone");
    expect(materials.map((material) => material.materialId)).not.toContain("bel-lecture-14");
  });

  it("resolves non-openable lecture sources and marks them unsupported for the viewer", () => {
    const lecture = resolveCourseMaterialForStudyContext(
      BEL_STUDY_CONTEXT,
      "bel-lecture-14",
    );

    expect(lecture).toMatchObject({
      materialId: "bel-lecture-14",
      kind: "lecture",
      openableInSession: false,
      fallbackMaterialId: "bel-mastercard",
    });
  });
});

describe("course material tools", () => {
  it("opens a supported course PDF with open_course_material", async () => {
    const onOpenCourseMaterial = vi.fn(async (material) => ({
      artifactId: "artifact-danone",
      title: material.title,
      materialId: material.materialId,
    }));
    const tools = createToolSet({ onOpenCourseMaterial });
    const tool = tools.find((entry) => entry.name === "open_course_material");

    const result = await tool!.execute({
      materialId: "bel-danone",
      reason: "Review the case before cold-calling the student on stakeholders.",
    });

    expect(onOpenCourseMaterial).toHaveBeenCalledWith(
      expect.objectContaining({
        materialId: "bel-danone",
        openableInSession: true,
        assetUrl: "/course-materials/bel/danone.pdf",
      }),
    );
    expect(result).toMatchObject({
      success: true,
      artifactId: "artifact-danone",
      materialId: "bel-danone",
      title: "Danone: Redefining Corporate Responsibility",
    });
  });

  it("rejects non-openable lecture materials with a supported fallback suggestion", async () => {
    const onOpenCourseMaterial = vi.fn();
    const tools = createToolSet({ onOpenCourseMaterial });
    const tool = tools.find((entry) => entry.name === "open_course_material");

    const result = await tool!.execute({
      materialId: "bel-lecture-14",
    });

    expect(onOpenCourseMaterial).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
      materialId: "bel-lecture-14",
      suggestedMaterialId: "bel-mastercard",
    });
  });

  it("returns the currently selected course material through get_current_file_context", async () => {
    const fileContext: FileSessionContext = {
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
    const tools = createToolSet({ fileContext });
    const tool = tools.find((entry) => entry.name === "get_current_file_context");

    const result = await tool!.execute({});

    expect(result).toMatchObject({
      success: true,
      available: true,
      artifactId: "artifact-danone",
      provenance: "course_material",
      materialId: "bel-danone",
      assetUrl: "/course-materials/bel/danone.pdf",
    });
  });
});
