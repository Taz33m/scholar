import {
  getClaimedArtifactKind,
  looksLikeArtifactSuccessClaim,
  stripArtifactClaimSentences,
  type ArtifactClaimKind,
} from "@/lib/artifact-claim-guard";

export interface AssistantTurnToolResult {
  toolName: string;
  success: boolean;
}

export interface AssistantTurnValidationInput {
  text: string;
  functionCallNames?: string[];
  toolResults?: AssistantTurnToolResult[];
  allowFunctionCallBacking?: boolean;
}

export interface AssistantTurnValidationResult {
  text: string;
  claimKind: ArtifactClaimKind | null;
  hasArtifactClaim: boolean;
  hasBacking: boolean;
  shouldDropAudio: boolean;
  shouldUseFallback: boolean;
}

export const ARTIFACT_TOOL_NAMES_BY_KIND: Record<ArtifactClaimKind, string[]> = {
  deepdive: ["generate_deep_dive"],
  visualization: ["generate_visualization", "generate_diagram"],
  flashcards: ["generate_flashcards"],
  quiz: ["generate_quiz"],
  worksheet: ["generate_worksheet", "create_worksheet"],
  google_doc: ["create_google_doc"],
  google_sheet: ["create_google_sheet"],
};

export const assistantTurnHasArtifactBacking = (
  claimKind: ArtifactClaimKind,
  input: AssistantTurnValidationInput,
) => {
  const functionCallNames = input.functionCallNames ?? [];
  if (
    input.allowFunctionCallBacking !== false &&
    ARTIFACT_TOOL_NAMES_BY_KIND[claimKind].some((toolName) =>
      functionCallNames.includes(toolName),
    )
  ) {
    return true;
  }

  const toolResults = input.toolResults ?? [];
  return toolResults.some(
    (result) =>
      result.success &&
      ARTIFACT_TOOL_NAMES_BY_KIND[claimKind].includes(result.toolName),
  );
};

export const validateAssistantTurnText = (
  input: AssistantTurnValidationInput,
): AssistantTurnValidationResult => {
  const text = input.text.trim();
  const claimKind = getClaimedArtifactKind(text);
  const hasArtifactClaim =
    claimKind !== null && looksLikeArtifactSuccessClaim(text);

  if (!hasArtifactClaim || !claimKind) {
    return {
      text,
      claimKind: null,
      hasArtifactClaim: false,
      hasBacking: false,
      shouldDropAudio: false,
      shouldUseFallback: false,
    };
  }

  const hasBacking = assistantTurnHasArtifactBacking(claimKind, input);
  if (hasBacking) {
    return {
      text,
      claimKind,
      hasArtifactClaim: true,
      hasBacking: true,
      shouldDropAudio: false,
      shouldUseFallback: false,
    };
  }

  const strippedText = stripArtifactClaimSentences(text);
  return {
    text: strippedText,
    claimKind,
    hasArtifactClaim: true,
    hasBacking: false,
    shouldDropAudio: true,
    shouldUseFallback: strippedText.length === 0,
  };
};
