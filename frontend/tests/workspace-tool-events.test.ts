import { describe, expect, it } from "vitest";
import {
  buildWorkspaceTabs,
  hasDocsArtifact,
  hasQuizArtifact,
  hasSheetsArtifact,
  hasWorksheetArtifact,
} from "../lib/workspace-tabs";
import type { DeepDiveState } from "../types/deepdive";
import type { FlashcardSessionState } from "../types/flashcard";
import type { SessionEvent, TutorSession } from "../types/session";
import type { VisualizationState } from "../types/visualization";

const NOW = new Date("2026-03-08T12:00:00.000Z");

const IDLE_FLASHCARDS: FlashcardSessionState = {
  cards: [],
  currentIndex: 0,
  isFlipped: false,
  mode: "idle",
  generatedAt: null,
};

const IDLE_VISUALIZATION: VisualizationState = {
  imageData: null,
  description: null,
  generatedAt: null,
  mode: "idle",
};

const IDLE_DEEPDIVE: DeepDiveState = {
  imageData: null,
  overviewText: null,
  topic: null,
  generatedAt: null,
  mode: "idle",
};

const createEvent = (
  toolName: string,
  type: SessionEvent["type"] = "tool_result",
): SessionEvent => ({
  id: `event-${toolName}`,
  type,
  timestamp: NOW,
  text: `Tool result for ${toolName}`,
  metadata: {
    toolName,
  },
});

const createSession = (overrides?: Partial<TutorSession>): TutorSession => ({
  id: "session-1",
  title: "Session 1",
  summary: "",
  status: "active",
  createdAt: NOW,
  updatedAt: NOW,
  endedAt: null,
  events: [],
  artifacts: [],
  snapshot: {
    contentView: "flashcards",
    activeTab: "flashcards",
    flashcardSession: IDLE_FLASHCARDS,
    visualizationState: IDLE_VISUALIZATION,
    deepDiveState: IDLE_DEEPDIVE,
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
  ...overrides,
  studyContext: overrides?.studyContext ?? null,
});

describe("tool event tab detection", () => {
  it("adds Docs tab from tool event metadata", () => {
    const session = createSession({
      events: [createEvent("create_google_doc")],
    });

    expect(hasDocsArtifact(session)).toBe(true);
    const tabs = buildWorkspaceTabs({
      flashcardSession: IDLE_FLASHCARDS,
      visualizationState: IDLE_VISUALIZATION,
      deepDiveState: IDLE_DEEPDIVE,
      activeSession: session,
    });

    expect(tabs.map((tab) => tab.id)).toContain("docs");
  });

  it("adds Sheets tab from tool event metadata", () => {
    const session = createSession({
      events: [createEvent("create_google_sheet")],
    });

    expect(hasSheetsArtifact(session)).toBe(true);
    const tabs = buildWorkspaceTabs({
      flashcardSession: IDLE_FLASHCARDS,
      visualizationState: IDLE_VISUALIZATION,
      deepDiveState: IDLE_DEEPDIVE,
      activeSession: session,
    });

    expect(tabs.map((tab) => tab.id)).toContain("sheets");
  });

  it("does not mistake worksheet language for a sheets artifact", () => {
    const session = createSession({
      artifacts: [
        {
          id: "artifact-worksheet",
          type: "worksheet",
          title: "Probability Worksheet",
          createdAt: NOW,
          summary: "A printable worksheet on probability trees.",
          instructions: "Complete each question.",
          estimatedTimeMinutes: 20,
          difficulty: "medium",
          document: {
            subtitle: null,
            learningObjectives: [],
            sections: [
              {
                id: "section-1",
                heading: "Practice",
                directions: null,
                items: [
                  {
                    kind: "short_answer",
                    questionId: "q1",
                    prompt: "Explain expected value.",
                    placeholder: null,
                    lineCount: 3,
                  },
                ],
              },
            ],
          },
          answerKey: [
            {
              questionId: "q1",
              answerText: "Weighted average outcome.",
              explanation: "Expected value summarizes the long-run average.",
            },
          ],
        },
      ],
    });

    expect(hasSheetsArtifact(session)).toBe(false);

    const tabs = buildWorkspaceTabs({
      flashcardSession: IDLE_FLASHCARDS,
      visualizationState: IDLE_VISUALIZATION,
      deepDiveState: IDLE_DEEPDIVE,
      activeSession: session,
    });

    expect(tabs.map((tab) => tab.id)).not.toContain("sheets");
    expect(tabs.map((tab) => tab.id)).toContain("worksheet");
  });

  it("does not mistake an uploaded PDF document for a google docs artifact", () => {
    const session = createSession({
      artifacts: [
        {
          id: "artifact-file",
          type: "uploaded_file",
          title: "Probability Review Packet",
          createdAt: NOW,
          summary: "A PDF document covering probability review problems.",
          fileName: "probability-review.pdf",
          mimeType: "application/pdf",
          storageKey: "uploaded-file:session-1:artifact-file",
          extractedText: "1. Define conditional probability.",
          provenance: "upload",
        },
      ],
      snapshot: {
        ...createSession().snapshot,
        activeTab: "file",
        fileState: {
          activeFileArtifactId: "artifact-file",
        },
      },
    });

    expect(hasDocsArtifact(session)).toBe(false);

    const tabs = buildWorkspaceTabs({
      flashcardSession: IDLE_FLASHCARDS,
      visualizationState: IDLE_VISUALIZATION,
      deepDiveState: IDLE_DEEPDIVE,
      activeSession: session,
    });

    expect(tabs.map((tab) => tab.id)).toContain("file");
    expect(tabs.map((tab) => tab.id)).not.toContain("docs");
  });

  it("uses a course material file as the selected File tab label", () => {
    const session = createSession({
      artifacts: [
        {
          id: "artifact-case",
          type: "course_material_file",
          title: "Danone: Redefining Corporate Responsibility",
          createdAt: NOW,
          summary: "CSR case packet.",
          fileName: "danone.pdf",
          mimeType: "application/pdf",
          extractedText: "Core dilemma: whether Danone can scale stakeholder commitments.",
          materialId: "bel-danone",
          sourceKind: "case",
          courseBrainVersionId: "2026-04-13",
          assetUrl: "/course-materials/bel/danone.pdf",
          provenance: "course_material",
        },
      ],
      snapshot: {
        ...createSession().snapshot,
        activeTab: "file",
        fileState: {
          activeFileArtifactId: "artifact-case",
        },
      },
    });

    const tabs = buildWorkspaceTabs({
      flashcardSession: IDLE_FLASHCARDS,
      visualizationState: IDLE_VISUALIZATION,
      deepDiveState: IDLE_DEEPDIVE,
      activeSession: session,
    });

    expect(tabs).toContainEqual({
      id: "file",
      label: "Danone: Redefining Corporate Responsibility",
      kind: "artifact",
    });
  });

  it("adds docs and sheets tabs from explicit artifact types", () => {
    const session = createSession({
      artifacts: [
        {
          id: "artifact-doc",
          type: "google_doc",
          title: "Mitosis Memo",
          createdAt: NOW,
          summary: "A concise mitosis memo.",
          sections: [
            {
              heading: "Overview",
              content: "Mitosis has multiple phases.",
              bullets: ["Prophase", "Metaphase"],
            },
          ],
        },
        {
          id: "artifact-sheet",
          type: "google_sheet",
          title: "Study Tracker",
          createdAt: NOW,
          summary: "Weekly study plan.",
          sheets: [
            {
              name: "Plan",
              columns: ["Day", "Topic"],
              rows: [["Mon", "Biology"]],
            },
          ],
        },
      ],
    });

    expect(hasDocsArtifact(session)).toBe(true);
    expect(hasSheetsArtifact(session)).toBe(true);

    const tabs = buildWorkspaceTabs({
      flashcardSession: IDLE_FLASHCARDS,
      visualizationState: IDLE_VISUALIZATION,
      deepDiveState: IDLE_DEEPDIVE,
      activeSession: session,
    });

    expect(tabs.map((tab) => tab.id)).toEqual(["canvas", "sheets", "docs"]);
  });

  it("does not add Quiz tab from event keywords alone", () => {
    const session = createSession({
      events: [createEvent("generate_quiz"), createEvent("build_presentation")],
    });

    expect(hasQuizArtifact(session)).toBe(false);

    const tabs = buildWorkspaceTabs({
      flashcardSession: IDLE_FLASHCARDS,
      visualizationState: IDLE_VISUALIZATION,
      deepDiveState: IDLE_DEEPDIVE,
      activeSession: session,
    });

    const tabIds = tabs.map((tab) => tab.id as string);
    expect(tabIds).not.toContain("quiz");
    expect(tabIds).not.toContain("slides");
  });

  it("adds Quiz tab only from a real quiz artifact", () => {
    const session = createSession({
      artifacts: [
        {
          id: "artifact-quiz",
          type: "quiz",
          title: "Cell Biology Quiz",
          createdAt: NOW,
          summary: "Five medium-difficulty practice questions.",
          questions: [
            {
              prompt: "Which organelle contains genetic material?",
              choices: ["Nucleus", "Ribosome", "Golgi apparatus"],
              correctAnswer: "Nucleus",
              explanation: "The nucleus stores most of the cell's DNA.",
            },
          ],
        },
      ],
    });

    expect(hasQuizArtifact(session)).toBe(true);

    const tabs = buildWorkspaceTabs({
      flashcardSession: IDLE_FLASHCARDS,
      visualizationState: IDLE_VISUALIZATION,
      deepDiveState: IDLE_DEEPDIVE,
      activeSession: session,
    });

    expect(tabs.map((tab) => tab.id)).toContain("quiz");
  });

  it("keeps stable tab order across content and tool artifacts", () => {
    const session = createSession({
      events: [
        createEvent("create_google_doc"),
        createEvent("create_google_sheet"),
      ],
      artifacts: [
        {
          id: "artifact-quiz",
          type: "quiz",
          title: "Practice Quiz",
          createdAt: NOW,
          summary: "Quick knowledge check.",
          questions: [
            {
              prompt: "What does DNA stand for?",
              choices: [
                "Deoxyribonucleic acid",
                "Dynamic neural analysis",
                "Digital nucleic array",
              ],
              correctAnswer: "Deoxyribonucleic acid",
              explanation: "DNA is short for deoxyribonucleic acid.",
            },
          ],
        },
      ],
    });

    const tabs = buildWorkspaceTabs({
      flashcardSession: {
        ...IDLE_FLASHCARDS,
        mode: "reviewing",
      },
      visualizationState: {
        ...IDLE_VISUALIZATION,
        mode: "ready",
        imageData: "data:image/png;base64,vis",
      },
      deepDiveState: {
        ...IDLE_DEEPDIVE,
        mode: "ready",
        imageData: "data:image/png;base64,deep",
      },
      activeSession: session,
    });

    expect(tabs.map((tab) => tab.id)).toEqual([
      "canvas",
      "flashcards",
      "visualization",
      "deepdive",
      "sheets",
      "docs",
      "quiz",
    ]);
  });

  it("adds a worksheet tab using the selected worksheet title", () => {
    const session = createSession({
      artifacts: [
        {
          id: "worksheet-1",
          type: "worksheet",
          title: "Genetics Guided Practice",
          createdAt: NOW,
          summary: "Punnett squares and allele review.",
          instructions: "Answer each item carefully.",
          estimatedTimeMinutes: 18,
          difficulty: "medium",
          document: {
            subtitle: "Unit 3 practice",
            learningObjectives: ["Review inheritance patterns"],
            sections: [
              {
                id: "section-1",
                heading: "Core Practice",
                directions: "Choose the best answer.",
                items: [
                  {
                    kind: "multiple_choice",
                    questionId: "question-1",
                    prompt: "Which allele is dominant?",
                    choices: [
                      { id: "choice-1", label: "A", text: "A" },
                      { id: "choice-2", label: "B", text: "a" },
                      { id: "choice-3", label: "C", text: "Both equally" },
                    ],
                  },
                ],
              },
            ],
          },
          answerKey: [
            {
              questionId: "question-1",
              answerText: "A. A",
              explanation: "Capital-letter allele is dominant in this example.",
            },
          ],
        },
      ],
      snapshot: {
        ...createSession().snapshot,
        activeTab: "worksheet",
        worksheetState: {
          activeWorksheetArtifactId: "worksheet-1",
          responsesByArtifactId: {},
        },
      },
    });

    expect(hasWorksheetArtifact(session)).toBe(true);

    const tabs = buildWorkspaceTabs({
      flashcardSession: IDLE_FLASHCARDS,
      visualizationState: IDLE_VISUALIZATION,
      deepDiveState: IDLE_DEEPDIVE,
      activeSession: session,
    });

    expect(tabs.map((tab) => tab.id)).toContain("worksheet");
    expect(tabs.find((tab) => tab.id === "worksheet")?.label).toBe(
      "Genetics Guided Practice",
    );
  });
});
