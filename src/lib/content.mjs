/**
 * Data access over the snapshot written by scripts/fetch-notion.mjs,
 * plus resolution of the database-to-layout map.
 */

// Statically imported so Vite inlines the snapshot at bundle time. If this file
// is missing the build fails fast — run `npm run fetch` (npm run build does it).
import data from '../data/notion.json';
import { databaseLayouts } from '../../site.config.mjs';
import { toPlain } from './richtext.mjs';

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

/** Every row that gets its own page — the source of truth for routing + sitemap. */
export const routableRows = databases.flatMap((db) => {
  const cfg = layoutFor(db.title);
  if (!cfg.ownPages || cfg.layout === 'none') return [];
  return db.items.map((item) => ({ ...item, dbTitle: db.title, layout: cfg }));
});

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
