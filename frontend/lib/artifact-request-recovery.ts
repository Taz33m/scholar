import { isExplicitFlashcardRequest } from "@/lib/flashcard-intent";

export interface ArtifactRequestRecovery {
  toolName:
    | "generate_flashcards"
    | "generate_quiz"
    | "generate_worksheet";
  args: Record<string, unknown>;
}

const QUIZ_REQUEST_PATTERN =
  /\b(?:quiz|test|exam|assessment|practice questions?)\b/i;
const QUIZ_CREATION_PATTERN =
  /\b(?:make|create|generate|build|prepare|give me)\b/i;

const WORKSHEET_REQUEST_PATTERN =
  /\b(?:worksheet|work sheet|guided practice|practice sheet|handout|problem set)\b/i;
const WORKSHEET_CREATION_PATTERN =
  /\b(?:make|create|generate|build|prepare|give me)\b/i;

const normalizeTopic = (value: string) =>
  value.replace(/\s+/g, " ").trim();

export const inferArtifactRequestRecovery = (
  prompt: string,
  conversationContext?: string,
): ArtifactRequestRecovery | null => {
  const normalizedPrompt = normalizeTopic(prompt);
  const normalizedContext = normalizeTopic(conversationContext ?? "");
  const topic = normalizedContext || normalizedPrompt;

  if (!topic) {
    return null;
  }

  if (isExplicitFlashcardRequest(normalizedPrompt)) {
    return {
      toolName: "generate_flashcards",
      args: {
        topic,
      },
    };
  }

  if (
    QUIZ_REQUEST_PATTERN.test(normalizedPrompt) &&
    (QUIZ_CREATION_PATTERN.test(normalizedPrompt) ||
      /\bready for a quiz\b/i.test(normalizedPrompt))
  ) {
    return {
      toolName: "generate_quiz",
      args: {
        topic,
      },
    };
  }

  if (
    WORKSHEET_REQUEST_PATTERN.test(normalizedPrompt) &&
    WORKSHEET_CREATION_PATTERN.test(normalizedPrompt)
  ) {
    return {
      toolName: "generate_worksheet",
      args: {
        topic,
      },
    };
  }

  return null;
};

export const hasRenderableAssistantText = (text: string) => {
  const normalized = text
    .replace(/[`*_#>\-[\]()]|\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return /[A-Za-z0-9]/.test(normalized);
};
