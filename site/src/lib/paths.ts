/**
 * Normalize the base URL to always end with a trailing slash.
 * Astro's import.meta.env.BASE_URL may or may not include one.
 */
export function getBase(): string {
  const raw = import.meta.env.BASE_URL ?? "/";
  return raw.endsWith("/") ? raw : raw + "/";
}
