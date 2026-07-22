/**
 * Notion -> src/data/notion.json
 *
 * Runs before every `astro build`. Walks the source page, auto-discovers every
 * inline database (including ones nested inside callouts, columns and toggles),
 * rebuilds the Notion view in code, and pulls each row's full body content.
 *
 * Reads NOTION_TOKEN / NOTION_PAGE_ID from the environment. Never hard-code them.
 */

import './load-env.mjs';
import { Client, APIResponseError } from '@notionhq/client';
import { writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../src/data/notion.json');
const ASSET_DIR = resolve(__dirname, '../public/notion-assets');
const ASSET_BASE = '/notion-assets';

const { NOTION_TOKEN, NOTION_PAGE_ID } = process.env;

if (!NOTION_TOKEN) {
  console.error(
    '\n  NOTION_TOKEN is not set.\n' +
      '  Local dev: copy .env.example to .env and fill it in.\n' +
      '  Railway:   add it under Service -> Variables.\n'
  );
  process.exit(1);
}
if (!NOTION_PAGE_ID) {
  console.error('\n  NOTION_PAGE_ID is not set. See .env.example.\n');
  process.exit(1);
}

const notion = new Client({ auth: NOTION_TOKEN });

/* ------------------------------------------------------------------ *
 * Rate limiting
 * Notion allows ~3 requests/second and answers 429 with Retry-After.
 * We serialise requests behind a small gap and retry on 429/5xx/network.
 * ------------------------------------------------------------------ */

const GAP_MS = 340;
const MAX_ATTEMPTS = 6;
let lastCall = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function throttle() {
  const wait = lastCall + GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
}

/** Wrap every Notion call: paced, retried with exponential backoff + jitter. */
async function api(label, fn) {
  let attempt = 0;
  for (;;) {
    attempt++;
    await throttle();
    try {
      return await fn();
    } catch (err) {
      const status = err instanceof APIResponseError ? err.status : undefined;
      const retriable =
        status === 429 || (status >= 500 && status < 600) || err?.code === 'notionhq_client_request_timeout';

      if (!retriable || attempt >= MAX_ATTEMPTS) {
        if (status === 404) {
          console.error(
            `\n  404 on ${label}.\n` +
              '  The integration probably has not been shared with the page.\n' +
              '  In Notion: open the page -> ... -> Connections -> add your integration.\n'
          );
        }
        throw err;
      }

      const retryAfter = Number(err?.headers?.['retry-after']);
      const backoff = Number.isFinite(retryAfter)
        ? retryAfter * 1000
        : Math.min(2 ** attempt * 250, 8000) + Math.random() * 250;

      console.warn(`  retry ${attempt}/${MAX_ATTEMPTS - 1} on ${label} (${status ?? err.code}) in ${Math.round(backoff)}ms`);
      await sleep(backoff);
    }
  }
}

/** Drain a cursor-paginated Notion endpoint. */
async function paginate(label, call) {
  const out = [];
  let cursor;
  do {
    const res = await api(label, () => call(cursor));
    out.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return out;
}

/* ------------------------------------------------------------------ *
 * Block tree
 * ------------------------------------------------------------------ */

/**
 * Recursively read a block subtree.
 * `child_database` blocks are recorded but NOT descended into — their rows are
 * fetched separately through the data-source query so the view logic applies.
 */
async function readBlocks(blockId, found, depth = 0) {
  if (depth > 12) return []; // guard against pathological nesting

  const blocks = await paginate(`blocks.children ${blockId}`, (cursor) =>
    notion.blocks.children.list({ block_id: blockId, start_cursor: cursor, page_size: 100 })
  );

  for (const block of blocks) {
    if (block.type === 'child_database') {
      found.push({ id: block.id, title: block.child_database?.title ?? '' });
      block.__isDatabase = true;
      continue;
    }
    // Buttons come back with no label or URL, so record their ids — they are
    // what you key the `buttons` map on in site.config.mjs.
    if (block.type === 'unsupported' && block.unsupported?.block_type === 'button') {
      buttonIds.push(block.id);
    }
    if (block.has_children) {
      block.__children = await readBlocks(block.id, found, depth + 1);
    }
  }
  return blocks;
}

/* ------------------------------------------------------------------ *
 * Slugs
 * ------------------------------------------------------------------ */

const usedSlugs = new Set();

/** Button block ids seen during the walk, reported at the end of the fetch. */
const buttonIds = [];

/**
 * Title -> clean, keyword-friendly slug. No Notion hex IDs.
 * Non-Latin titles (e.g. 肥躉) slugify to empty, so fall back to a short row id.
 */
function slugify(title, rowId) {
  const base = String(title ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80)
    .replace(/-+$/, '');

  let slug = base || `item-${String(rowId).replace(/-/g, '').slice(0, 8)}`;

  if (usedSlugs.has(slug)) {
    let n = 2;
    while (usedSlugs.has(`${slug}-${n}`)) n++;
    slug = `${slug}-${n}`;
  }
  usedSlugs.add(slug);
  return slug;
}

/* ------------------------------------------------------------------ *
 * Property helpers
 * ------------------------------------------------------------------ */

const plain = (rich) => (Array.isArray(rich) ? rich.map((t) => t.plain_text).join('') : '');

function readProperty(prop) {
  if (!prop) return null;
  switch (prop.type) {
    case 'title':
      return plain(prop.title);
    case 'rich_text':
      return plain(prop.rich_text);
    case 'number':
      return prop.number;
    case 'checkbox':
      return prop.checkbox;
    case 'select':
      return prop.select?.name ?? null;
    case 'multi_select':
      return prop.multi_select.map((o) => o.name);
    case 'status':
      return prop.status?.name ?? null;
    case 'url':
      return prop.url;
    case 'date':
      return prop.date?.start ?? null;
    case 'files':
      return prop.files.map((f) => f.file?.url ?? f.external?.url).filter(Boolean);
    default:
      return null;
  }
}

const fileUrl = (obj) => obj?.file?.url ?? obj?.external?.url ?? null;

/* ------------------------------------------------------------------ *
 * Assets
 * Notion serves uploaded files from S3 with a signed URL that expires within
 * the hour. A static snapshot must therefore keep its own copy, or every image
 * 404s shortly after deploy. Externally-hosted URLs are left untouched.
 * ------------------------------------------------------------------ */

const assetCache = new Map();

const EXT_BY_TYPE = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/avif': '.avif',
};

async function localiseAsset(url) {
  if (!url) return url;

  // Only mirror Notion-hosted files; leave third-party URLs as-is.
  const isNotionHosted =
    /(^https?:\/\/[^/]*amazonaws\.com\/)|(^https?:\/\/[^/]*notion-static\.com\/)|(^https?:\/\/[^/]*notion\.so\/(image|signed)\/)/.test(
      url
    );
  if (!isNotionHosted) return url;

  // The signature query string changes every fetch, so key the cache on the path.
  const key = url.split('?')[0];
  if (assetCache.has(key)) return assetCache.get(key);

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const buf = Buffer.from(await res.arrayBuffer());
    const hash = createHash('sha256').update(buf).digest('hex').slice(0, 16);
    const ext =
      extname(new URL(key).pathname).toLowerCase() ||
      EXT_BY_TYPE[(res.headers.get('content-type') ?? '').split(';')[0].trim()] ||
      '.bin';

    const filename = `${hash}${ext}`;
    await mkdir(ASSET_DIR, { recursive: true });
    await writeFile(resolve(ASSET_DIR, filename), buf);

    const local = `${ASSET_BASE}/${filename}`;
    assetCache.set(key, local);
    return local;
  } catch (err) {
    // A missing image must not fail the whole build.
    console.warn(`  asset download failed (${err.message}), keeping remote URL`);
    assetCache.set(key, url);
    return url;
  }
}

/** Mirror custom-emoji images referenced from rich text. */
async function localiseRichText(rich) {
  for (const token of rich ?? []) {
    const emoji = token.mention?.custom_emoji;
    if (emoji?.url) emoji.url = await localiseAsset(emoji.url);
  }
}

/**
 * Build favicon-sized copies of the page icon.
 *
 * Notion icons are full-resolution uploads — often ~1000px and hundreds of KB.
 * Pointing <link rel="icon"> straight at one makes every page load drag the
 * whole file down just to paint a 16px tab icon, so emit small copies instead.
 * Returns null on any failure; the caller then falls back to the full-size icon.
 */
async function makeFavicons(localIconPath) {
  if (!localIconPath?.startsWith(ASSET_BASE)) return null;

  try {
    const { default: sharp } = await import('sharp');
    const source = resolve(ASSET_DIR, localIconPath.slice(ASSET_BASE.length + 1));

    const sizes = { small: 32, large: 180 };
    const out = {};

    for (const [key, size] of Object.entries(sizes)) {
      const buf = await sharp(source)
        .resize(size, size, { fit: 'cover' })
        .png({ compressionLevel: 9 })
        .toBuffer();

      const name = `favicon-${size}.png`;
      await writeFile(resolve(ASSET_DIR, name), buf);
      out[key] = `${ASSET_BASE}/${name}`;
    }
    return out;
  } catch (err) {
    console.warn(`  favicon generation skipped (${err.message})`);
    return null;
  }
}

/** Walk a block tree and mirror every embedded Notion-hosted asset. */
async function localiseBlocks(blocks) {
  for (const block of blocks ?? []) {
    const node = block[block.type];
    if (node?.rich_text) await localiseRichText(node.rich_text);
    if (node?.caption) await localiseRichText(node.caption);
    if (block.type === 'table_row') {
      for (const cell of node?.cells ?? []) await localiseRichText(cell);
    }
    if (node && (node.file || node.external)) {
      const localUrl = await localiseAsset(fileUrl(node));
      if (node.file) node.file.url = localUrl;
      else node.external.url = localUrl;
    }
    if (node?.icon) {
      const iconUrl = fileUrl(node.icon);
      if (iconUrl) {
        const localIcon = await localiseAsset(iconUrl);
        if (node.icon.file) node.icon.file.url = localIcon;
        else if (node.icon.external) node.icon.external.url = localIcon;
      }
    }
    if (block.__children) await localiseBlocks(block.__children);
  }
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

async function main() {
  const started = Date.now();
  console.log(`\nFetching Notion page ${NOTION_PAGE_ID}`);

  const rootPage = await api('pages.retrieve root', () =>
    notion.pages.retrieve({ page_id: NOTION_PAGE_ID })
  );

  const rootTitle =
    plain(Object.values(rootPage.properties ?? {}).find((p) => p.type === 'title')?.title) || '';

  const discovered = [];
  const rootBlocks = await readBlocks(NOTION_PAGE_ID, discovered);

  console.log(
    `  discovered ${discovered.length} inline database(s): ` +
      discovered.map((d) => `"${d.title || 'untitled'}"`).join(', ')
  );

  const databases = [];

  for (const db of discovered) {
    // A database can expose several data sources (2025-09-03 API). Use the first.
    const meta = await api(`databases.retrieve ${db.id}`, () =>
      notion.databases.retrieve({ database_id: db.id })
    );
    const dataSourceId = meta.data_sources?.[0]?.id ?? db.id;

    const schema = await api(`dataSources.retrieve ${dataSourceId}`, () =>
      notion.dataSources.retrieve({ data_source_id: dataSourceId })
    );
    const props = schema.properties ?? {};

    // Rebuild the Notion view in code — but only where the properties exist.
    const hasHidden = props.is_hidden?.type === 'checkbox';
    const hasOrder = props.view_order?.type === 'number';

    const query = { data_source_id: dataSourceId, page_size: 100 };
    if (hasHidden) query.filter = { property: 'is_hidden', checkbox: { equals: false } };
    if (hasOrder) query.sorts = [{ property: 'view_order', direction: 'ascending' }];

    const notes = [];
    if (!hasHidden) notes.push('no is_hidden -> publishing all rows');
    if (!hasOrder) {
      notes.push(
        props.view_order
          ? `view_order is "${props.view_order.type}", not number -> ignored, using Notion order`
          : 'no view_order -> using Notion order'
      );
    }
    console.log(`  "${db.title}" ${notes.length ? `(${notes.join('; ')})` : '(filtered + sorted)'}`);

    const rows = await paginate(`dataSources.query ${dataSourceId}`, (cursor) =>
      notion.dataSources.query({ ...query, start_cursor: cursor })
    );

    const items = [];
    for (const row of rows) {
      const properties = Object.fromEntries(
        Object.entries(row.properties ?? {}).map(([k, v]) => [k, readProperty(v)])
      );

      const titleKey = Object.keys(row.properties ?? {}).find(
        (k) => row.properties[k].type === 'title'
      );
      const title = titleKey ? properties[titleKey] : '';

      // A `Slug` property wins over the derived slug when present and non-empty.
      const explicit = typeof properties.Slug === 'string' ? properties.Slug.trim() : '';
      const slug = explicit ? slugify(explicit, row.id) : slugify(title, row.id);

      const rowFound = [];
      const blocks = await readBlocks(row.id, rowFound);
      await localiseBlocks(blocks);

      const rowCover = await localiseAsset(fileUrl(row.cover));
      const rowIcon = row.icon?.emoji ?? (await localiseAsset(fileUrl(row.icon)));

      items.push({
        id: row.id,
        title,
        slug,
        properties,
        cover: rowCover,
        icon: rowIcon,
        lastEdited: row.last_edited_time,
        blocks,
      });
    }

    databases.push({
      id: db.id,
      dataSourceId,
      title: db.title || schema.title?.map?.((t) => t.plain_text).join('') || '',
      appliedFilter: hasHidden,
      appliedSort: hasOrder,
      items,
    });
  }

  await localiseBlocks(rootBlocks);

  const pageIcon = rootPage.icon?.emoji ?? (await localiseAsset(fileUrl(rootPage.icon)));

  const payload = {
    generatedAt: new Date().toISOString(),
    page: {
      id: NOTION_PAGE_ID,
      title: rootTitle,
      cover: await localiseAsset(fileUrl(rootPage.cover)),
      icon: pageIcon,
      // Small copies of the icon for <link rel="icon">; null for emoji icons,
      // which the layout renders as an inline SVG instead.
      favicons: await makeFavicons(pageIcon),
      blocks: rootBlocks,
    },
    databases,
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload, null, 2), 'utf8');

  const rowCount = databases.reduce((n, d) => n + d.items.length, 0);
  console.log(
    `\n  wrote ${OUT}\n  ${databases.length} database(s), ${rowCount} row(s), ${(
      (Date.now() - started) / 1000
    ).toFixed(1)}s`
  );

  if (buttonIds.length) {
    console.log(
      `\n  ${buttonIds.length} Notion button block(s) found. The API returns no label or\n` +
        '  URL for these, so they render only if you give them one in the `buttons`\n' +
        '  map in site.config.mjs (a `default` entry covers them all):'
    );
    for (const id of buttonIds) console.log(`    ${id}`);
  }
  console.log('');
}

main().catch((err) => {
  console.error('\nNotion fetch failed:', err.message ?? err);
  process.exit(1);
});
