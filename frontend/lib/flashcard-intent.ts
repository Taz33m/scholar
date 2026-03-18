const DIRECT_FLASHCARD_PATTERNS = [
  /\bflashcards?\b/i,
  /\bflash cards?\b/i,
  /\bstudy cards?\b/i,
  /\bstudy sets?\b/i,
  /\breview cards?\b/i,
  /\brevision cards?\b/i,
  /\bpractice cards?\b/i,
  /\banki(?: deck)?\b/i,
];

const ACTIONABLE_CARD_PATTERNS = [
  /\b(?:generate|create|make|build|prepare)\b[^.!?\n]{0,80}\b(?:cards?|deck|study set)\b/i,
  /\b(?:give me|let's do|lets do)\b[^.!?\n]{0,80}\b(?:cards?|deck|study set)\b/i,
];

export function isExplicitFlashcardRequest(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;

  return [...DIRECT_FLASHCARD_PATTERNS, ...ACTIONABLE_CARD_PATTERNS].some(
    (pattern) => pattern.test(normalized),
  );
}
