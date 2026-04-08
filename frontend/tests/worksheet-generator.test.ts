import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: mocks.generateContent,
    },
  })),
}));

import {
  generateWorksheet,
  normalizeGeneratedWorksheet,
} from "@/lib/gemini/worksheet";

describe("normalizeGeneratedWorksheet", () => {
  beforeEach(() => {
    mocks.generateContent.mockReset();
    process.env.GEMINI_API_KEY = "test-gemini-key";
  });

  it("builds a structured worksheet document and answer key", () => {
    const worksheet = normalizeGeneratedWorksheet({
      title: "Cell Transport Worksheet",
      summary: "Guided practice on membrane transport.",
      instructions: "Complete each section carefully.",
      estimatedTimeMinutes: 18,
      difficulty: "medium",
      document: {
        subtitle: "Biology Unit 2",
        learningObjectives: [
          "Distinguish passive and active transport",
        ],
        sections: [
          {
            heading: "Core Concepts",
            directions: "Answer each question.",
            items: [
              {
                kind: "multiple_choice",
                prompt: "Which process moves water across a semipermeable membrane?",
                choices: ["Osmosis", "Diffusion", "Endocytosis"],
                correctChoice: "Osmosis",
                explanation: "Osmosis is the movement of water across a membrane.",
              },
              {
                kind: "short_answer",
                prompt: "Explain why active transport requires energy.",
                sampleAnswer: "It moves substances against their concentration gradient.",
                explanation: "Moving against the gradient requires cellular energy.",
                lineCount: 4,
              },
              {
                kind: "multi_select",
                prompt: "Which processes are forms of passive transport?",
                choices: ["Diffusion", "Osmosis", "Active transport", "Facilitated diffusion"],
                correctChoices: ["Diffusion", "Osmosis", "Facilitated diffusion"],
                explanation: "All three move substances without cellular energy input.",
              },
            ],
          },
        ],
      },
    });

    expect(worksheet.title).toBe("Cell Transport Worksheet");
    expect(worksheet.document.sections).toHaveLength(1);
    expect(worksheet.document.sections[0].items).toHaveLength(3);
    expect(worksheet.document.sections[0].items[0]).toMatchObject({
      kind: "multiple_choice",
      questionId: "question-1",
    });
    expect(worksheet.answerKey).toHaveLength(3);
    expect(worksheet.answerKey[0]).toMatchObject({
      questionId: "question-1",
      answerText: "A. Osmosis",
    });
  });

  it("rejects worksheets with too few valid questions", () => {
    expect(() =>
      normalizeGeneratedWorksheet({
        title: "Broken Worksheet",
        summary: "Invalid data",
        instructions: "Do the work.",
        estimatedTimeMinutes: 10,
        difficulty: "easy",
        document: {
          sections: [
            {
              heading: "Only Section",
              items: [
                {
                  kind: "multiple_choice",
                  prompt: "Valid question",
                  choices: ["A", "B", "C"],
                  correctChoice: "A",
                  explanation: "A",
                },
                {
                  kind: "short_answer",
                  prompt: "",
                  sampleAnswer: "Missing prompt",
                  explanation: "Invalid",
                },
              ],
            },
          ],
        },
    }),
    ).toThrow("too few valid worksheet questions");
  });

  it("requests JSON output without the oversized provider schema", async () => {
    mocks.generateContent.mockResolvedValue({
      text: JSON.stringify({
        title: "Probability Worksheet",
        summary: "Guided probability practice.",
        instructions: "Show your reasoning where needed.",
        estimatedTimeMinutes: 18,
        difficulty: "medium",
        document: {
          subtitle: "Algebra II",
          learningObjectives: ["Compare independent and dependent events"],
          sections: [
            {
              heading: "Core Practice",
              directions: "Answer each question.",
              items: [
                {
                  kind: "multiple_choice",
                  prompt: "Which event pair is independent?",
                  choices: [
                    "Flipping a coin and rolling a die",
                    "Drawing two cards without replacement",
                    "Weather today and weather tomorrow",
                  ],
                  correctChoice: "Flipping a coin and rolling a die",
                  explanation: "One event does not change the probability of the other.",
                },
                {
                  kind: "multi_select",
                  prompt: "Which values are valid probabilities?",
                  choices: ["-0.2", "0", "0.45", "1"],
                  correctChoices: ["0", "0.45", "1"],
                  explanation: "Probabilities fall between 0 and 1 inclusive.",
                },
                {
                  kind: "short_answer",
                  prompt: "Explain what a probability of 1 means.",
                  placeholder: "Write 2-3 sentences.",
                  lineCount: 3,
                  sampleAnswer: "It means the event is certain to happen.",
                  explanation: "A probability of 1 represents certainty.",
                },
              ],
            },
          ],
        },
      }),
    });

    const worksheet = await generateWorksheet({
      topic: "probability",
      focus: "guided practice",
      questionCount: 5,
      difficulty: "medium",
    });

    expect(worksheet.title).toBe("Probability Worksheet");
    expect(mocks.generateContent).toHaveBeenCalledTimes(1);
    expect(mocks.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-2.5-flash",
        config: expect.objectContaining({
          responseMimeType: "application/json",
          temperature: 0.35,
        }),
      }),
    );
    expect(mocks.generateContent.mock.calls[0]?.[0]?.config).not.toHaveProperty(
      "responseJsonSchema",
    );
  });
});
