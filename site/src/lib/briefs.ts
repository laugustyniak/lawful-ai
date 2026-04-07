import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

/** Shape of a brief's parsed frontmatter + derived fields */
export interface Brief {
  /** Slug derived from file path, e.g. "2026/04/07" */
  slug: string;
  /** ISO date string from frontmatter */
  date: string;
  /** Brief title */
  title: string;
  /** Tag list for categorization */
  tags: string[];
  /** Raw markdown body (without frontmatter) */
  body: string;
  /** Estimated reading time in minutes */
  readingTime: number;
  /** First ~150 characters of plain text for previews */
  excerpt: string;
}

/** Directory where brief markdown files live (two levels up from site/) */
const BRIEFS_DIR = path.resolve(
  new URL(".", import.meta.url).pathname,
  "../../../briefs",
);

/**
 * Recursively collect all .md files under a directory.
 */
function collectMarkdownFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectMarkdownFiles(fullPath));
    } else if (entry.name.endsWith(".md")) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Strip markdown syntax for plain-text excerpts.
 */
function stripMarkdown(md: string): string {
  return (
    md
      // Remove headings
      .replace(/^#{1,6}\s+/gm, "")
      // Remove bold/italic markers
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
      // Remove links, keep text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // Remove inline code
      .replace(/`([^`]+)`/g, "$1")
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, "")
      // Remove blockquote markers
      .replace(/^>\s?/gm, "")
      // Remove horizontal rules
      .replace(/^---+$/gm, "")
      // Remove images
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      // Collapse whitespace
      .replace(/\n{2,}/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Calculate estimated reading time (average 230 wpm).
 */
function calculateReadingTime(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 230));
}

/**
 * Parse a single markdown file into a Brief object.
 */
function parseBrief(filePath: string): Brief {
  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);

  // Derive slug from relative path: "2026/04/07.md" -> "2026/04/07"
  const relativePath = path.relative(BRIEFS_DIR, filePath);
  const slug = relativePath.replace(/\.md$/, "");

  const plainText = stripMarkdown(content);

  return {
    slug,
    date: data.date
      ? new Date(data.date).toISOString().split("T")[0]
      : "1970-01-01",
    title: data.title || `Brief ${slug}`,
    tags: Array.isArray(data.tags) ? data.tags : [],
    body: content,
    readingTime: calculateReadingTime(plainText),
    excerpt:
      plainText.length > 150
        ? plainText.substring(0, 150).trim() + "..."
        : plainText,
  };
}

/**
 * Get all briefs sorted by date (newest first).
 */
export function getAllBriefs(): Brief[] {
  const files = collectMarkdownFiles(BRIEFS_DIR);
  const briefs = files.map(parseBrief);
  return briefs.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

/**
 * Get a single brief by its slug path (e.g. "2026/04/07").
 */
export function getBriefBySlug(slug: string): Brief | undefined {
  const filePath = path.join(BRIEFS_DIR, `${slug}.md`);
  if (!fs.existsSync(filePath)) return undefined;
  return parseBrief(filePath);
}

/**
 * Get all unique tags across all briefs.
 */
export function getAllTags(): string[] {
  const briefs = getAllBriefs();
  const tagSet = new Set<string>();
  for (const brief of briefs) {
    for (const tag of brief.tags) {
      tagSet.add(tag);
    }
  }
  return [...tagSet].sort();
}

/**
 * Group briefs by month for the archive page.
 * Returns an array of [monthLabel, briefs[]] sorted newest month first.
 */
export function getBriefsByMonth(): [string, Brief[]][] {
  const briefs = getAllBriefs();
  const grouped = new Map<string, Brief[]>();

  for (const brief of briefs) {
    const d = new Date(brief.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
    });
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(brief);
  }

  // Sort keys descending and map to [label, briefs]
  const sortedKeys = [...grouped.keys()].sort().reverse();
  return sortedKeys.map((key) => {
    const briefs = grouped.get(key)!;
    const d = new Date(key + "-01");
    const label = d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
    });
    return [label, briefs];
  });
}

/**
 * Format a date string to a human-readable format.
 */
export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Format a short date for list views.
 */
export function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Calculate day streak since first brief.
 */
export function getDaysSinceFirst(): number {
  const briefs = getAllBriefs();
  if (briefs.length === 0) return 0;
  const oldest = briefs[briefs.length - 1];
  const start = new Date(oldest.date);
  const now = new Date();
  const diff = now.getTime() - start.getTime();
  return Math.max(1, Math.floor(diff / (1000 * 60 * 60 * 24)));
}
