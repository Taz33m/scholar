import { describe, expect, it } from "vitest";

import { normalizeGeneratedQuiz } from "@/lib/gemini/quiz";

describe("normalizeGeneratedQuiz", () => {
  it("keeps valid questions and normalizes title and summary", () => {
    const quiz = normalizeGeneratedQuiz({
      title: "Cell Cycle Check",
      summary: "Practice questions on mitosis.",
      questions: [
        {
          prompt: "Which phase comes after prophase?",
          choices: ["Metaphase", "Anaphase", "Telophase"],
          correctAnswer: "Metaphase",
          explanation: "Metaphase follows prophase.",
        },
        {
          prompt: "What lines up in the middle of the cell?",
          choices: ["Chromosomes", "Mitochondria", "Ribosomes"],
          correctAnswer: "Chromosomes",
          explanation: "Chromosomes align at the metaphase plate.",
        },
        {
          prompt: "What separates during anaphase?",
          choices: ["Sister chromatids", "Cell walls", "Ribosomes"],
          correctAnswer: "Sister chromatids",
          explanation: "Sister chromatids move to opposite poles.",
        },
      ],
    });

    expect(quiz.title).toBe("Cell Cycle Check");
    expect(quiz.summary).toBe("Practice questions on mitosis.");
    expect(quiz.questions).toHaveLength(3);
    expect(quiz.questions[0].correctAnswer).toBe("Metaphase");
  });

  it("rejects quizzes with too few valid questions after normalization", () => {
    expect(() =>
      normalizeGeneratedQuiz({
        title: "Broken Quiz",
        summary: "Invalid payload",
        questions: [
          {
            prompt: "Valid one",
            choices: ["A", "B", "C"],
            correctAnswer: "A",
            explanation: "Because A is correct.",
          },
          {
            prompt: "",
            choices: ["A", "B", "C"],
            correctAnswer: "A",
            explanation: "Invalid because prompt is blank.",
          },
          {
            prompt: "Invalid answer",
            choices: ["A", "B", "C"],
            correctAnswer: "D",
            explanation: "Correct answer must be one of the choices.",
          },
        ],
      }),
    ).toThrow("too few valid quiz questions");
  });
});
