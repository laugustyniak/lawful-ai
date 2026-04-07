#!/usr/bin/env node
/**
 * update-readme.mjs
 *
 * Reads the latest 5 briefs from briefs/, then updates README.md:
 *   - Replaces content between <!-- LATEST_BRIEF_START --> and <!-- LATEST_BRIEF_END -->
 *     with a summary of the most recent brief.
 *   - Replaces content between <!-- STATS_START --> and <!-- STATS_END -->
 *     with a stats table (total count, current streak, start date).
 *
 * Usage: node scripts/update-readme.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BRIEFS_DIR = path.join(ROOT, 'briefs');
const README_PATH = path.join(ROOT, 'README.md');

// --- Helpers ---

/**
 * Recursively collects all .md files under a directory.
 * @param {string} dir
 * @returns {string[]}
 */
function collectMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== '.gitkeep') {
      files.push(full);
    }
  }
  return files;
}

/**
 * Parses YAML frontmatter from markdown content.
 * @param {string} raw
 * @returns {{ frontmatter: Record<string, unknown>, body: string }}
 */
function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw };

  const yamlBlock = match[1];
  const body = match[2];
  const frontmatter = {};

  for (const line of yamlBlock.split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const raw_value = kv[2].trim();

    if (raw_value.startsWith('[') && raw_value.endsWith(']')) {
      frontmatter[key] = raw_value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    } else {
      frontmatter[key] = raw_value.replace(/^['"]|['"]$/g, '');
    }
  }

  return { frontmatter, body };
}

/**
 * Replaces content between two HTML comment markers (inclusive) in a string.
 * @param {string} text       Full file text
 * @param {string} startMarker  e.g. '<!-- LATEST_BRIEF_START -->'
 * @param {string} endMarker    e.g. '<!-- LATEST_BRIEF_END -->'
 * @param {string} replacement  New content to place between the markers
 * @returns {string}
 */
function replaceBetweenMarkers(text, startMarker, endMarker, replacement) {
  const escaped_start = startMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escaped_end = endMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${escaped_start}[\\s\\S]*?${escaped_end}`, 'g');
  return text.replace(pattern, `${startMarker}\n${replacement}\n${endMarker}`);
}

/**
 * Calculates the current daily streak from an array of ISO date strings.
 * A streak is a consecutive run of days ending today (or yesterday if today
 * has no brief yet).
 * @param {string[]} dates  ISO date strings, may be in any order
 * @returns {number}
 */
function calculateStreak(dates) {
  if (dates.length === 0) return 0;

  // Normalize to Set of YYYY-MM-DD strings
  const dateSet = new Set(dates.map((d) => d.slice(0, 10)));
  const sorted = Array.from(dateSet).sort().reverse(); // newest first

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // Streak must include today or yesterday to be "current"
  if (!dateSet.has(today) && !dateSet.has(yesterday)) return 0;

  let streak = 0;
  let cursor = dateSet.has(today) ? new Date(today) : new Date(yesterday);

  while (true) {
    const key = cursor.toISOString().slice(0, 10);
    if (!dateSet.has(key)) break;
    streak++;
    cursor = new Date(cursor.getTime() - 86400000);
  }

  return streak;
}

/**
 * Formats a date string as "Month YYYY" for the "Since" field.
 * @param {string} isoDate
 */
function formatSinceDate(isoDate) {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// --- Main ---

const allFiles = collectMarkdownFiles(BRIEFS_DIR);

/** @type {{ date: string, title: string, tags: string[], summary: string, body: string }[]} */
const briefs = [];

for (const filePath of allFiles) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(raw);

  const date = typeof frontmatter.date === 'string' ? frontmatter.date : '';
  const title = typeof frontmatter.title === 'string' ? frontmatter.title : path.basename(filePath, '.md');
  const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [];
  const summary =
    typeof frontmatter.summary === 'string'
      ? frontmatter.summary
      : body.replace(/#+\s[^\n]*/g, '').trim().slice(0, 300);

  briefs.push({ date, title, tags, summary, body });
}

// Sort newest first
briefs.sort((a, b) => {
  const da = a.date ? new Date(a.date).getTime() : 0;
  const db = b.date ? new Date(b.date).getTime() : 0;
  return db - da;
});

const latest5 = briefs.slice(0, 5);
const totalCount = briefs.length;
const allDates = briefs.map((b) => b.date).filter(Boolean);
const streak = calculateStreak(allDates);
const oldestDate = allDates.length > 0 ? allDates[allDates.length - 1] : null;
const sinceLabel = oldestDate ? formatSinceDate(oldestDate) : 'N/A';

// --- Build LATEST_BRIEF replacement ---

let latestBriefBlock = '';

if (latest5.length === 0) {
  latestBriefBlock = '*No briefs published yet. First brief coming soon!*';
} else {
  const [newest, ...older] = latest5;

  // Show the most recent brief's summary prominently
  latestBriefBlock = `### ${newest.title}\n\n${newest.summary}`;

  if (older.length > 0) {
    latestBriefBlock += '\n\n**Recent briefs:**\n';
    for (const b of older) {
      latestBriefBlock += `- **${b.date}** — ${b.title}\n`;
    }
  }
}

// --- Build STATS replacement ---

const statsBlock = `| Metric | Value |
|---|---|
| Total Briefs | ${totalCount} |
| Streak | ${streak} day${streak !== 1 ? 's' : ''} |
| Since | ${sinceLabel} |`;

// --- Update README ---

let readme = fs.readFileSync(README_PATH, 'utf8');

readme = replaceBetweenMarkers(
  readme,
  '<!-- LATEST_BRIEF_START -->',
  '<!-- LATEST_BRIEF_END -->',
  latestBriefBlock,
);

readme = replaceBetweenMarkers(
  readme,
  '<!-- STATS_START -->',
  '<!-- STATS_END -->',
  statsBlock,
);

fs.writeFileSync(README_PATH, readme, 'utf8');

console.log(`README.md updated — ${totalCount} briefs, streak: ${streak} days`);
