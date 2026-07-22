/**
 * Data access over the snapshot written by scripts/fetch-notion.mjs,
 * plus resolution of the database-to-layout map.
 */

// Statically imported so Vite inlines the snapshot at bundle time. If this file
// is missing the build fails fast — run `npm run fetch` (npm run build does it).
import data from '../data/notion.json';
import { databaseLayouts, buttons } from '../../site.config.mjs';
import { toPlain } from './richtext.mjs';

/**
 * Resolve a Notion button block to a link, or null when unconfigured.
 * See the `buttons` block in site.config.mjs for why this is needed.
 */
export function buttonFor(blockId) {
  const cfg = (buttons ?? {})[blockId] ?? (buttons ?? {}).default;
  if (!cfg?.url || !cfg?.label) return null;
  return cfg;
}

export const notionData = data;
export const page = data.page;
export const databases = data.databases;

const DEFAULT_LAYOUT = { layout: 'list', ownPages: true };

/** Resolve a database's layout config by its Notion title (case-insensitive). */
export function layoutFor(dbTitle) {
  const key = Object.keys(databaseLayouts).find(
    (k) => k !== 'default' && k.toLowerCase() === String(dbTitle ?? '').toLowerCase()
  );
  const cfg = key ? databaseLayouts[key] : databaseLayouts.default;
  return { ...DEFAULT_LAYOUT, ...(cfg ?? {}) };
}

/** Databases that should render on the index, in discovery order. */
export const visibleDatabases = databases.filter((db) => layoutFor(db.title).layout !== 'none');

/**
 * Ids of databases reachable from the page's block tree — these render in place.
 * Anything not in here is rendered after the body so no content is lost.
 */
export const inlineDatabaseIds = (() => {
  const ids = new Set();
  const walk = (blocks) => {
    for (const block of blocks ?? []) {
      if (block.type === 'child_database') ids.add(block.id);
      if (block.__children) walk(block.__children);
    }
  };
  walk(page.blocks);
  return ids;
})();

/** Every row that gets its own page — the source of truth for routing + sitemap. */
export const routableRows = databases.flatMap((db) => {
  const cfg = layoutFor(db.title);
  if (!cfg.ownPages || cfg.layout === 'none') return [];
  return db.items.map((item) => ({ ...item, dbTitle: db.title, layout: cfg }));
});

/**
 * FAQ, read from the Notion page itself.
 *
 * Put the FAQ under a heading whose text starts with "FAQ" or "Frequently
 * asked" (configurable via `faqHeading`). Three ways of writing it are
 * recognised, so you can use whichever is natural in Notion:
 *
 *   1. **Toggles** — toggle title is the question, its contents the answer.
 *   2. **Paragraph pairs** — a paragraph ending in "?" is a question, and the
 *      paragraphs after it are its answer, until the next question.
 *   3. **Sub-headings** — a lower-level heading is the question, the blocks
 *      under it the answer.
 *
 * Collection stops at the next heading of the same or higher level.
 *
 * These blocks already render as ordinary page content; this reads them a
 * second time only so the page can also emit FAQPage JSON-LD. Nothing is
 * invented and nothing is duplicated on screen — edit the FAQ in Notion like
 * any other content and the structured data follows on the next build.
 */
const HEADING_TYPES = ['heading_1', 'heading_2', 'heading_3'];

/** All descendant text of a block, flattened — used for an answer body. */
function blockText(blocks) {
  const parts = [];
  for (const block of blocks ?? []) {
    const node = block[block.type];
    const text = toPlain(node?.rich_text);
    if (text.trim()) parts.push(text.trim());
    if (block.__children) {
      const nested = blockText(block.__children);
      if (nested) parts.push(nested);
    }
  }
  return parts.join(' ');
}

/** The blocks belonging to a section, i.e. until the next same-or-higher heading. */
function sectionBlocks(blocks, headingIndex) {
  const level = HEADING_TYPES.indexOf(blocks[headingIndex].type);
  const out = [];
  for (let i = headingIndex + 1; i < blocks.length; i++) {
    const block = blocks[i];
    if (HEADING_TYPES.includes(block.type) && HEADING_TYPES.indexOf(block.type) <= level) break;
    out.push(block);
  }
  return out;
}

/** Read Q&A pairs out of a section, accepting the three ways of writing them. */
function readFaqSection(section) {
  // 1. Toggles — the tidiest form, and unambiguous.
  const toggles = section
    .filter((b) => b.type === 'toggle')
    .map((b) => ({ q: toPlain(b.toggle?.rich_text).trim(), a: blockText(b.__children) }))
    .filter((x) => x.q && x.a);
  if (toggles.length) return toggles;

  // 2. Sub-headings — heading is the question, blocks beneath it the answer.
  const subheads = [];
  for (let i = 0; i < section.length; i++) {
    if (!HEADING_TYPES.includes(section[i].type)) continue;
    const q = toPlain(section[i][section[i].type]?.rich_text).trim();
    const a = blockText(sectionBlocks(section, i));
    if (q && a) subheads.push({ q, a });
  }
  if (subheads.length) return subheads;

  // 3. Paragraph pairs — a paragraph ending in "?" is a question, and every
  //    paragraph after it belongs to its answer until the next question.
  const items = [];
  let current = null;
  for (const block of section) {
    const text = toPlain(block[block.type]?.rich_text).trim();
    if (!text) continue;
    // Handles "?" plus the full-width "？" used in Chinese text.
    if (/[?？]$/.test(text)) {
      if (current?.a.length) items.push({ q: current.q, a: current.a.join(' ') });
      current = { q: text, a: [] };
    } else if (current) {
      current.a.push(text);
    }
  }
  if (current?.a.length) items.push({ q: current.q, a: current.a.join(' ') });
  return items;
}

/** Find the FAQ heading anywhere in the tree and read the Q&A beneath it. */
function findFaq(blocks, pattern) {
  for (let i = 0; i < (blocks?.length ?? 0); i++) {
    const block = blocks[i];

    if (HEADING_TYPES.includes(block.type)) {
      const text = toPlain(block[block.type]?.rich_text).trim();
      if (pattern.test(text)) {
        const items = readFaqSection(sectionBlocks(blocks, i));
        if (items.length) return items;
      }
    }

    if (block.__children) {
      const nested = findFaq(block.__children, pattern);
      if (nested.length) return nested;
    }
  }
  return [];
}

export function faqFromNotion(pattern = /^(faq|frequently asked)/i) {
  return findFaq(page.blocks, pattern);
}

/**
 * First meaningful paragraph of a row, used as its meta description.
 * Falls back to the tagline at the call site when a row has no prose.
 */
export function excerpt(blocks, limit = 155) {
  for (const block of blocks ?? []) {
    const text =
      block.type === 'paragraph'
        ? toPlain(block.paragraph.rich_text)
        : block.type === 'callout'
          ? toPlain(block.callout.rich_text)
          : '';
    const clean = text.trim();
    if (clean.length > 20) {
      return clean.length > limit ? `${clean.slice(0, limit - 1).trimEnd()}…` : clean;
    }
    if (block.__children) {
      const nested = excerpt(block.__children, limit);
      if (nested) return nested;
    }
  }
  return '';
}
