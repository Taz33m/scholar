const parseBoolean = (value: string | undefined, fallback: boolean) => {
  if (value == null) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
};

export const isTutorPromptBundleEnabled = () => {
  if (typeof window === "undefined") {
    return parseBoolean(
      process.env.TUTOR_PROMPT_BUNDLE_ENABLED,
      process.env.NODE_ENV !== "production",
    );
  }

  return parseBoolean(
    process.env.NEXT_PUBLIC_TUTOR_PROMPT_BUNDLE_ENABLED,
    process.env.NODE_ENV !== "production",
  );
};
