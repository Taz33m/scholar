import { describe, expect, it } from "vitest";

import { isExplicitFlashcardRequest } from "@/lib/flashcard-intent";

describe("isExplicitFlashcardRequest", () => {
  it("accepts direct flashcard requests", () => {
    expect(isExplicitFlashcardRequest("Generate flashcards on mitosis")).toBe(true);
    expect(isExplicitFlashcardRequest("Can you make me study cards for photosynthesis?")).toBe(true);
    expect(isExplicitFlashcardRequest("Let's do an Anki deck on linear algebra")).toBe(true);
    expect(isExplicitFlashcardRequest("Create a study set on mitosis")).toBe(true);
    expect(isExplicitFlashcardRequest("Make revision cards for glycolysis")).toBe(true);
  });

  it("rejects general tutoring prompts", () => {
    expect(isExplicitFlashcardRequest("Explain mitosis")).toBe(false);
    expect(isExplicitFlashcardRequest("Give me a deep dive on photosynthesis")).toBe(false);
    expect(isExplicitFlashcardRequest("What is the difference between mitosis and meiosis?")).toBe(false);
  });
});
