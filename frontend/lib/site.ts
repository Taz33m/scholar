export const SITE_NAME = "Apple Scholar";

const DEFAULT_SITE_ORIGIN = "http://localhost:3000";

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

function normalizeSiteOrigin(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return DEFAULT_SITE_ORIGIN;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimTrailingSlash(trimmed);
  }

  return trimTrailingSlash(`https://${trimmed}`);
}

export function getSiteOrigin() {
  return normalizeSiteOrigin(
    process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.VERCEL_PROJECT_PRODUCTION_URL ||
      process.env.VERCEL_URL ||
      DEFAULT_SITE_ORIGIN,
  );
}

export function getSiteUrl(pathname = "/") {
  return new URL(pathname, getSiteOrigin()).toString();
}
