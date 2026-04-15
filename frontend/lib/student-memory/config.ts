export const STUDENT_MEMORY_CONSENT_VERSION =
  process.env.STUDENT_MEMORY_CONSENT_VERSION?.trim() ||
  "2026-04-supermemory-v1";

export const PROFILE_SIGNAL_WINDOW_DAYS = 45;
export const PROFILE_STALE_AFTER_DAYS = 60;
export const STUDY_EPISODE_DOWNGRADE_AFTER_DAYS = 30;
export const STUDY_EPISODE_EXPIRE_AFTER_DAYS = 90;

const parseBoolean = (value: string | undefined) => {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

export const isStudentMemoryIntegrationEnabled = () =>
  parseBoolean(process.env.STUDENT_MEMORY_ENABLED) ||
  (typeof process.env.SUPERMEMORY_API_KEY === "string" &&
    process.env.SUPERMEMORY_API_KEY.trim().length > 0);

export const getSupermemoryBaseUrl = () =>
  process.env.SUPERMEMORY_BASE_URL?.trim() || "https://api.supermemory.ai";
