import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audio", () => ({
  playToolCue: vi.fn(),
}));

import { createAdkTools } from "@/lib/adk-tools";
import type { QuizSessionContext } from "@/types/session";

const createToolSet = (quizContext: QuizSessionContext | null) =>
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
    getQuizContext: () => quizContext,
    setContentView: vi.fn(),
  });

describe("get_current_quiz_context tool", () => {
  it("returns unavailable when no quiz is loaded", async () => {
    const tools = createToolSet(null);
    const tool = tools.find((entry) => entry.name === "get_current_quiz_context");

    const result = await tool!.execute({});

    expect(result).toMatchObject({
      success: false,
      available: false,
      message: "No quiz is currently loaded.",
    });
  });

  it("returns questions and selected answers before submission", async () => {
    const tools = createToolSet({
      title: "Cell Division Quiz",
      summary: "Review of mitosis basics.",
      isSubmitted: false,
      answeredCount: 1,
      totalQuestions: 2,
      score: null,
      questions: [
        {
          index: 0,
          prompt: "What is the first phase of mitosis?",
          choices: ["Prophase", "Metaphase", "Anaphase", "Telophase"],
          correctAnswer: "Prophase",
          explanation: "Mitosis begins with prophase.",
          selectedAnswer: "Metaphase",
          isCorrect: null,
        },
        {
          index: 1,
          prompt: "Where do chromosomes line up?",
          choices: ["Nucleus", "Equator", "Centrosome", "Membrane"],
          correctAnswer: "Equator",
          explanation: "They align at the equatorial plate.",
          selectedAnswer: null,
          isCorrect: null,
        },
      ],
    });
    const tool = tools.find((entry) => entry.name === "get_current_quiz_context");

    const result = await tool!.execute({});

    expect(result).toMatchObject({
      success: true,
      available: true,
      title: "Cell Division Quiz",
      isSubmitted: false,
      answeredCount: 1,
      totalQuestions: 2,
      score: null,
      message: 'Current quiz: "Cell Division Quiz". Answered 1 of 2 questions.',
    });
    expect(result.questions).toEqual([
      {
        index: 0,
        prompt: "What is the first phase of mitosis?",
        choices: ["Prophase", "Metaphase", "Anaphase", "Telophase"],
        selectedAnswer: "Metaphase",
        correctAnswer: "Prophase",
        explanation: "Mitosis begins with prophase.",
        isCorrect: null,
      },
      {
        index: 1,
        prompt: "Where do chromosomes line up?",
        choices: ["Nucleus", "Equator", "Centrosome", "Membrane"],
        selectedAnswer: null,
        correctAnswer: "Equator",
        explanation: "They align at the equatorial plate.",
        isCorrect: null,
      },
    ]);
  });

  it("returns score and correctness after submission", async () => {
    const tools = createToolSet({
      title: "Photosynthesis Quiz",
      summary: "Light reactions and Calvin cycle.",
      isSubmitted: true,
      answeredCount: 2,
      totalQuestions: 2,
      score: 1,
      questions: [
        {
          index: 0,
          prompt: "Where do light reactions occur?",
          choices: ["Stroma", "Thylakoid membrane", "Cytoplasm", "Ribosome"],
          correctAnswer: "Thylakoid membrane",
          explanation: "The light reactions occur in the thylakoid membrane.",
          selectedAnswer: "Thylakoid membrane",
          isCorrect: true,
        },
        {
          index: 1,
          prompt: "What enzyme fixes carbon dioxide?",
          choices: ["ATP synthase", "Rubisco", "Catalase", "Amylase"],
          correctAnswer: "Rubisco",
          explanation: "Rubisco catalyzes carbon fixation.",
          selectedAnswer: "ATP synthase",
          isCorrect: false,
        },
      ],
    });
    const tool = tools.find((entry) => entry.name === "get_current_quiz_context");

    const result = await tool!.execute({});

    expect(result).toMatchObject({
      success: true,
      available: true,
      isSubmitted: true,
      score: 1,
      message: 'Current quiz: "Photosynthesis Quiz". Score 1 of 2.',
    });
    expect(result.questions).toEqual([
      expect.objectContaining({
        prompt: "Where do light reactions occur?",
        selectedAnswer: "Thylakoid membrane",
        correctAnswer: "Thylakoid membrane",
        isCorrect: true,
      }),
      expect.objectContaining({
        prompt: "What enzyme fixes carbon dioxide?",
        selectedAnswer: "ATP synthase",
        correctAnswer: "Rubisco",
        isCorrect: false,
      }),
    ]);
  });
});
