import { describe, expect, it } from "vitest";

import { normalizeGeneratedFlashcards } from "@/lib/gemini/flashcards";

describe("normalizeGeneratedFlashcards", () => {
  it("synthesizes missing ids and keeps valid cards", () => {
    const cards = normalizeGeneratedFlashcards({
      flashcards: [
        {
          title: "Mitosis overview",
          coreIdea: "Cell division creates two identical daughter cells.",
          question: "What is the main outcome of mitosis?",
          answer: "Two genetically identical daughter cells.",
        },
        {
          title: "Prophase",
          coreIdea: "Chromosomes condense and the spindle starts forming.",
          question: "What happens during prophase?",
          answer: "Chromosomes condense and spindle fibers begin to form.",
          source: "Biology Unit 3",
        },
        {
          title: "Metaphase",
          coreIdea: "Chromosomes align at the cell equator.",
          question: "Where do chromosomes line up in metaphase?",
          answer: "At the metaphase plate in the middle of the cell.",
        },
      ],
    });

    expect(cards).toHaveLength(3);
    expect(cards.every((card) => typeof card.id === "string" && card.id.length > 0)).toBe(true);
    expect(cards[1].source).toBe("Biology Unit 3");
  });

  it("rejects payloads with too few valid cards", () => {
    expect(() =>
      normalizeGeneratedFlashcards({
        flashcards: [
          {
            title: "Only one",
            coreIdea: "One",
            question: "One?",
            answer: "One.",
          },
        ],
      }),
    ).toThrow("too few valid flashcards");
  });
});
