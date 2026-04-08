import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audio", () => ({
  playToolCue: vi.fn(),
}));

import { createAdkTools } from "@/lib/adk-tools";
import type { WorksheetSessionContext } from "@/types/session";

const createToolSet = ({
  onSetGoogleSheet,
  onSetWorksheet,
  worksheetContext,
}: {
  worksheetContext: WorksheetSessionContext | null;
  onSetWorksheet?: ReturnType<typeof vi.fn>;
  onSetGoogleSheet?: ReturnType<typeof vi.fn>;
}) =>
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
    getWorksheetContext: () => worksheetContext,
    onSetGoogleSheet,
    onSetWorksheet,
    setContentView: vi.fn(),
  });

describe("get_current_worksheet_context tool", () => {
  it("returns unavailable when no worksheet is loaded", async () => {
    const tools = createToolSet({ worksheetContext: null });
    const tool = tools.find(
      (entry) => entry.name === "get_current_worksheet_context",
    );

    const result = await tool!.execute({});

    expect(result).toMatchObject({
      success: false,
      available: false,
      message: "No worksheet is currently loaded.",
    });
  });

  it("returns worksheet structure and live student response context", async () => {
    const tools = createToolSet({
      worksheetContext: {
      worksheetId: "worksheet-1",
      title: "Cell Respiration Worksheet",
      summary: "Guided practice on ATP production.",
      instructions: "Answer every item carefully.",
      estimatedTimeMinutes: 22,
      difficulty: "medium",
      answeredCount: 2,
      totalQuestions: 3,
      sections: [
        {
          id: "section-1",
          heading: "Core Practice",
          directions: "Choose the best answer.",
          items: [
            {
              kind: "multiple_choice",
              questionId: "question-1",
              prompt: "Where does glycolysis occur?",
              choices: [
                { id: "choice-1", label: "A", text: "Mitochondria" },
                { id: "choice-2", label: "B", text: "Cytoplasm" },
                { id: "choice-3", label: "C", text: "Nucleus" },
              ],
              response: {
                kind: "multiple_choice",
                selectedOptionId: "choice-2",
                note: "Occurs before the mitochondria steps.",
              },
              answerKey: {
                questionId: "question-1",
                answerText: "B. Cytoplasm",
                explanation: "Glycolysis takes place in the cytoplasm.",
              },
            },
          ],
        },
      ],
      answerKey: [
        {
          questionId: "question-1",
          answerText: "B. Cytoplasm",
          explanation: "Glycolysis takes place in the cytoplasm.",
        },
      ],
      },
    });

    const tool = tools.find(
      (entry) => entry.name === "get_current_worksheet_context",
    );

    const result = await tool!.execute({});

    expect(result).toMatchObject({
      success: true,
      available: true,
      worksheetId: "worksheet-1",
      answeredCount: 2,
      totalQuestions: 3,
      message:
        'Current worksheet: "Cell Respiration Worksheet". Answered 2 of 3 questions.',
    });
    expect(result.sections).toEqual([
      expect.objectContaining({
        heading: "Core Practice",
        items: [
          expect.objectContaining({
            prompt: "Where does glycolysis occur?",
            response: expect.objectContaining({
              selectedOptionId: "choice-2",
            }),
          }),
        ],
      }),
    ]);
  });
});

describe("worksheet generation tooling", () => {
  it("includes worksheet creation tools", () => {
    const tools = createToolSet({ worksheetContext: null });

    expect(tools.some((entry) => entry.name === "generate_worksheet")).toBe(true);
    expect(tools.some((entry) => entry.name === "create_worksheet")).toBe(true);
  });

  it("reroutes mistaken sheet requests with worksheet language into worksheet generation", async () => {
    const onSetWorksheet = vi.fn();
    const onSetGoogleSheet = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        title: "Stoichiometry Worksheet",
        summary: "Guided chemistry practice.",
        instructions: "Show your work.",
        estimatedTimeMinutes: 20,
        difficulty: "medium",
        document: {
          subtitle: "Chemistry",
          learningObjectives: [],
          sections: [
            {
              id: "section-1",
              heading: "Practice",
              directions: "Answer all questions.",
              items: [],
            },
          ],
        },
        answerKey: [],
      }),
    });

    vi.stubGlobal("fetch", fetchMock);
    const tools = createToolSet({
      onSetGoogleSheet,
      onSetWorksheet,
      worksheetContext: null,
    });
    const tool = tools.find((entry) => entry.name === "create_google_sheet");

    const result = await tool!.execute({
      objective: "Guided practice handout",
      topic: "Probability worksheet",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/generate-worksheet",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(onSetWorksheet).toHaveBeenCalledTimes(1);
    expect(onSetGoogleSheet).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      message: "Created worksheet: Stoichiometry Worksheet",
    });
  });
});
