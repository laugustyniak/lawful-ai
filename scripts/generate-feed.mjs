#!/usr/bin/env node
/**
 * generate-feed.mjs
 *
 * Reads all briefs/**\/YYYY/MM/DD.md files, parses YAML frontmatter,
 * and writes feed.json (latest 30) and feed.xml (RSS 2.0) to the repo root.
 *
 * Usage: node scripts/generate-feed.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BRIEFS_DIR = path.join(ROOT, 'briefs');
const SITE_URL = 'https://laugustyniak.github.io/lawful-ai';
const FEED_TITLE = 'Lawful AI';
const FEED_DESCRIPTION = 'Daily AI intelligence with a legal edge';
const MAX_ITEMS = 30;

/**
 * Recursively collects all .md files under a directory.
 * @param {string} dir
 * @returns {string[]} Absolute file paths
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
 * Handles the common subset: string scalars and bracket-style arrays.
 * @param {string} raw  Full file content
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

    // Bracket array: [a, b, c]
    if (raw_value.startsWith('[') && raw_value.endsWith(']')) {
      frontmatter[key] = raw_value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    } else {
      // Strip surrounding quotes
      frontmatter[key] = raw_value.replace(/^['"]|['"]$/g, '');
    }
  }

  return { frontmatter, body };
}

/**
 * Derives a URL slug from the file path relative to briefs/.
 * e.g. briefs/2026/04/03.md -> /2026/04/03
 */
function fileToUrlPath(filePath) {
  const rel = path.relative(BRIEFS_DIR, filePath);
  // Remove .md extension and convert OS separators to forward slashes
  return '/' + rel.replace(/\\/g, '/').replace(/\.md$/, '');
}

/**
 * Escapes characters that are special in XML.
 * @param {string} str
 */
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Formats a date string or Date object as RFC 822 (RSS pub date).
 * @param {string | Date} d
 */
function toRfc822(d) {
  const date = d instanceof Date ? d : new Date(d);
  // Fallback for invalid dates
  if (isNaN(date.getTime())) return new Date().toUTCString();
  return date.toUTCString();
}

// --- Main ---

const mdFiles = collectMarkdownFiles(BRIEFS_DIR);

const items = [];
for (const filePath of mdFiles) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(raw);

  const date = frontmatter.date ?? '';
  const title = frontmatter.title ?? path.basename(filePath, '.md');
  const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [];
  const summary = frontmatter.summary ?? body.replace(/#+\s/g, '').slice(0, 300).trim();
  const urlPath = fileToUrlPath(filePath);
  const url = `${SITE_URL}${urlPath}`;

  items.push({ date, title, tags, summary, content: body.trim(), url });
}

// Sort newest first
items.sort((a, b) => {
  const da = a.date ? new Date(a.date).getTime() : 0;
  const db = b.date ? new Date(b.date).getTime() : 0;
  return db - da;
});

const latest = items.slice(0, MAX_ITEMS);

// --- Write feed.json ---

const feedJson = {
  title: FEED_TITLE,
  description: FEED_DESCRIPTION,
  link: SITE_URL,
  items: latest.map(({ date, title, tags, summary, content, url }) => ({
    date,
    title,
    tags,
    summary,
    content,
    url,
  })),
};

fs.writeFileSync(path.join(ROOT, 'feed.json'), JSON.stringify(feedJson, null, 2) + '\n', 'utf8');
console.log(`feed.json written (${latest.length} items)`);

// --- Write feed.xml (RSS 2.0) ---

const rssItems = latest
  .map(
    (item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.url)}</link>
      <guid isPermaLink="true">${escapeXml(item.url)}</guid>
      <pubDate>${toRfc822(item.date)}</pubDate>
      <description>${escapeXml(item.summary)}</description>
      ${item.tags.map((t) => `<category>${escapeXml(t)}</category>`).join('\n      ')}
    </item>`,
  )
  .join('\n');

const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(FEED_TITLE)}</title>
    <link>${escapeXml(SITE_URL)}</link>
    <description>${escapeXml(FEED_DESCRIPTION)}</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${escapeXml(SITE_URL + '/feed.xml')}" rel="self" type="application/rss+xml"/>
${rssItems}
  </channel>
</rss>
`;

fs.writeFileSync(path.join(ROOT, 'feed.xml'), rssXml, 'utf8');
console.log(`feed.xml written (${latest.length} items)`);
