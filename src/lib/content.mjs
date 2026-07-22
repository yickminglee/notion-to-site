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
 * Write the FAQ in Notion as **toggle blocks under a heading** whose text
 * starts with "FAQ" or "Frequently asked" (configurable via `faqHeading`).
 * Each toggle's summary is the question and its children are the answer.
 *
 * The toggles already render as ordinary page content; this only extracts them
 * a second time so the page can also emit FAQPage JSON-LD. Nothing is invented
 * and nothing is duplicated on screen — edit the FAQ in Notion like any other
 * content and the structured data follows on the next build.
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

/** Find the FAQ heading anywhere in the tree and read the toggles under it. */
function findFaq(blocks, pattern) {
  for (let i = 0; i < (blocks?.length ?? 0); i++) {
    const block = blocks[i];

    if (HEADING_TYPES.includes(block.type)) {
      const text = toPlain(block[block.type]?.rich_text).trim();
      if (pattern.test(text)) {
        const items = [];
        // Collect toggles until the next heading at the same or higher level.
        for (let j = i + 1; j < blocks.length; j++) {
          const next = blocks[j];
          if (HEADING_TYPES.includes(next.type)) {
            if (HEADING_TYPES.indexOf(next.type) <= HEADING_TYPES.indexOf(block.type)) break;
            continue;
          }
          if (next.type !== 'toggle') continue;
          const q = toPlain(next.toggle?.rich_text).trim();
          const a = blockText(next.__children);
          if (q && a) items.push({ q, a });
        }
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
