const TOOL_NAME_PATTERN = /\b(?:generate|create|get|show|flip|next|previous|edit)_[a-z0-9_]+\b/i;

export const looksLikeInternalPlanningText = (text: string) => {
  const trimmed = text.trim();
  const normalized = trimmed.toLowerCase();
  const hasToolNameMention = TOOL_NAME_PATTERN.test(trimmed);
  const hasPlanningPhrase =
    /\bi(?:'|’)ve decided to proceed with\b/.test(normalized) ||
    /\bi(?:'|’)m now initiating\b/.test(normalized) ||
    /\binitiating [a-z ]+ creation\b/.test(normalized) ||
    /\bmy plan is to\b/.test(normalized) ||
    /\bfirst step in creating\b/.test(normalized) ||
    /\bkeep the user updated on (?:its|their) progress\b/.test(normalized) ||
    /\bmy goal is to\b/.test(normalized) ||
    /\bi(?:'|’)m (?:focused on|now focused on|going to|crafting|formulating|preparing|planning)\b/.test(
      normalized,
    );

  return (
    normalized.startsWith("**clarifying") ||
    normalized.startsWith("**formulating") ||
    normalized.startsWith("**planning") ||
    normalized.startsWith("**thinking") ||
    normalized.startsWith("**initiating") ||
    normalized.startsWith("**starting") ||
    normalized.startsWith("**tool") ||
    normalized.startsWith("**visualizing") ||
    /\btool call\b/.test(normalized) ||
    hasToolNameMention ||
    hasPlanningPhrase
  );
};
