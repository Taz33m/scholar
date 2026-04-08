export type ArtifactClaimKind =
  | "deepdive"
  | "visualization"
  | "flashcards"
  | "quiz"
  | "worksheet"
  | "google_doc"
  | "google_sheet";

const SUCCESS_VERB_PATTERN =
  /\bi(?:'|’)ve\s+(?:created|generated|made|prepared|put together)\b|\bit(?:'|’)s ready\b|\bare ready\b/i;

export const getClaimedArtifactKind = (
  text: string,
): ArtifactClaimKind | null => {
  if (!SUCCESS_VERB_PATTERN.test(text)) {
    return null;
  }

  if (/\bdeep dive\b/i.test(text)) return "deepdive";
  if (/\b(?:visualization|diagram|illustration|flowchart|chart)\b/i.test(text)) {
    return "visualization";
  }
  if (/\b(?:flashcards?|study deck|review deck|deck of cards)\b/i.test(text)) {
    return "flashcards";
  }
  if (/\bquiz\b/i.test(text)) return "quiz";
  if (/\bworksheet\b/i.test(text)) return "worksheet";
  if (/\bgoogle docs?\b/i.test(text)) return "google_doc";
  if (/\bgoogle sheets?\b/i.test(text)) return "google_sheet";
  return null;
};

export const looksLikeArtifactSuccessClaim = (text: string) =>
  getClaimedArtifactKind(text) !== null;

export const stripArtifactClaimSentences = (text: string) => {
  const normalized = text.trim();
  if (!normalized) {
    return "";
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  return sentences
    .filter((sentence) => !looksLikeArtifactSuccessClaim(sentence))
    .join(" ")
    .trim();
};
