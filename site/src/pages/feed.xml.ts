import type { APIRoute } from "astro";
import { getAllBriefs } from "../lib/briefs";

/**
 * Generate an RSS 2.0 feed from all published briefs.
 */
export const GET: APIRoute = ({ site }) => {
  const briefs = getAllBriefs();
  const base = "/lawful-ai";
  const siteUrl = site?.toString().replace(/\/$/, "") || "https://laugustyniak.github.io";

  const items = briefs
    .map((brief) => {
      const pubDate = new Date(brief.date).toUTCString();
      const link = `${siteUrl}${base}/briefs/${brief.slug}/`;
      const categories = brief.tags
        .map((tag) => `<category>${escapeXml(tag)}</category>`)
        .join("\n        ");

      return `    <item>
      <title>${escapeXml(brief.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(brief.excerpt)}</description>
      ${categories}
    </item>`;
    })
    .join("\n");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Lawful AI</title>
    <description>Daily AI intelligence with a legal edge.</description>
    <link>${siteUrl}${base}/</link>
    <atom:link href="${siteUrl}${base}/feed.xml" rel="self" type="application/rss+xml" />
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <managingEditor>laugustyniak@gmail.com (Lukasz Augustyniak)</managingEditor>
    <webMaster>laugustyniak@gmail.com (Lukasz Augustyniak)</webMaster>
${items}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
};

/** Escape special XML characters. */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
