import type { FunctionDeclaration, Schema } from "@google/genai";

import type { PromptToolSurfaceEntry } from "@/lib/tutor-runtime/types";

const compactWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const summarizeDescription = (description: string | undefined) => {
  const normalized = compactWhitespace(description ?? "");
  if (!normalized) {
    return "No description provided.";
  }

  const [firstSentence] = normalized.split(/(?<=[.!?])\s+/);
  return firstSentence ?? normalized;
};

const getSchemaProperties = (schema: Schema | undefined) => {
  const candidate = schema as {
    properties?: Record<string, unknown>;
    required?: string[];
  };

  return {
    properties: candidate?.properties ?? {},
    required: Array.isArray(candidate?.required)
      ? candidate.required.filter((entry): entry is string => typeof entry === "string")
      : [],
  };
};

export const buildPromptToolSurfaceEntries = (
  declarations: FunctionDeclaration[],
): PromptToolSurfaceEntry[] =>
  declarations
    .map((declaration) => {
      const name = declaration.name?.trim();
      if (!name) {
        return null;
      }

      const { properties, required } = getSchemaProperties(declaration.parameters);
      const propertyNames = Object.keys(properties);

      return {
        name,
        description: summarizeDescription(declaration.description),
        requiredParameters: propertyNames.filter((key) => required.includes(key)),
        optionalParameters: propertyNames.filter((key) => !required.includes(key)),
      };
    })
    .filter(Boolean) as PromptToolSurfaceEntry[];

export const formatPromptToolSurfaceBlock = (
  declarations: FunctionDeclaration[],
) => {
  const entries = buildPromptToolSurfaceEntries(declarations);

  if (entries.length === 0) {
    return [
      "Route tool surface:",
      "No live workspace tools are available on this route.",
    ].join("\n");
  }

  return [
    "Route tool surface:",
    JSON.stringify(entries, null, 2),
  ].join("\n");
};
