# notion-to-site

Build a fast, static, SEO- and AI-crawler-readable website from a Notion page.

Content is fetched from the Notion API at build time and rendered to **real static
HTML** — no client-side JavaScript, no hydration. Google, ChatGPT, Perplexity and AI
Overviews read the full page on first request.

**This is a template repo.** Click *Use this template* to create each site as its own
repo, with its own theme, config, Railway service and domain. The pipeline is shared;
the sites stay independent.

MIT licensed.

---

## How it works

```
Notion page
   │  scripts/fetch-notion.mjs   (Notion API, official client)
   │    • walks the page's block tree
   │    • auto-discovers every inline database (child_database blocks),
   │      including ones nested inside callouts, columns and toggles
   │    • rebuilds the Notion view in code (filter + sort, see below)
   │    • pulls each row's full body content
   │    • mirrors Notion-hosted images into public/notion-assets/
   ▼
src/data/notion.json          (gitignored build artifact)
   │  astro build
   ▼
dist/                          static HTML + sitemap.xml
   │  npm start  (server.mjs, zero-dependency static server)
   ▼
Railway
```

Every redeploy runs the whole pipeline and publishes a fresh snapshot. There are no
scheduled or webhook rebuilds — redeploys are manual and deliberate.

### Why not notion-to-md?

This template renders Notion blocks straight to HTML rather than going through
Markdown. Notion pages that use **column layouts, nested callouts and custom emoji**
lose that structure in a Markdown round-trip, and `notion-to-md` v4 is alpha. The
renderer lives in [`src/components/NotionBlocks.astro`](src/components/NotionBlocks.astro)
and is about 200 lines — extend it when you hit a block type you need.

---

## Pinned versions

| Package | Version |
| --- | --- |
| `astro` | 7.1.3 |
| `@notionhq/client` | 5.23.2 |
| `@astrojs/sitemap` | 3.7.3 |
| Node | >= 20.12 (uses built-in `process.loadEnvFile`) |

Exact versions are pinned in `package.json` (no `^`) and locked in `package-lock.json`.
`@notionhq/client` v5 uses the **2025-09-03 data-source API**: databases expose one or
more data sources, and rows are queried via `dataSources.query` (`databases.query` no
longer exists).

---

## Setup

### 1. Create a Notion integration

1. Go to <https://www.notion.so/profile/integrations> → **New integration**.
2. Give it **read-only** capabilities — *Read content* only. It never needs write access.
3. Copy the token (starts with `ntn_`).
4. Open your source page in Notion → **⋯** → **Connections** → add the integration.

Access cascades from that one page to every child page and inline database, so you
only share the parent.

### 2. Configure

```bash
cp .env.example .env
```

Fill in `.env` — this file is gitignored and must never be committed:

| Variable | What it is |
| --- | --- |
| `NOTION_TOKEN` | The integration token. Secret. |
| `NOTION_PAGE_ID` | The page to build from (32 hex chars, with or without dashes). |
| `DOMAIN` | Public origin, no trailing slash. Drives canonical URLs and the sitemap. |

Everything else lives in [`site.config.mjs`](site.config.mjs): `name`, `tagline`,
`location`, `schemaType`, `theme`, the FAQ, and the database-to-layout map.

### 3. Run

```bash
npm install
npm run dev     # fetch from Notion, then serve at localhost:4321
npm run build   # fetch, then build static HTML into dist/
npm start       # serve dist/ (what Railway runs)
```

---

## The view logic

The Notion API does not expose views, so filtering and sorting are rebuilt in code:

- **Filter** — publish only rows whose **`is_hidden`** checkbox is **unchecked**
  (`checkbox: { equals: false }`).
- **Sort** — by **`view_order`** ascending.

Both are applied **only to databases that actually have those properties**, and each is
checked independently. A database without them publishes every row in its native Notion
order. `view_order` must be a **number** property — a text property sorts
lexicographically (`"10"` before `"2"`) and is therefore ignored, with a warning.

The fetch log tells you exactly what was applied per database:

```
  "Classes: swimming" (filtered + sorted)
  "Dog training testimonies" (no is_hidden -> publishing all rows; no view_order -> using Notion order)
```

> **Rows are public by default.** A database with no `is_hidden` property publishes
> everything in it. Add the property before pointing the pipeline at a database that
> holds anything private.

---

## Database-to-layout map

Because views aren't in the API, each database's layout is chosen in
`site.config.mjs`, keyed by the database's Notion title (case-insensitive):

```js
export const databaseLayouts = {
  'Classes: swimming': {
    layout: 'gallery',
    tagProperty: 'Age group',
    heading: 'Swimming lessons in Sai Kung',
    intro: 'Ming teaches child-led swimming lessons at Sai Kung Swimming Pool.',
  },
  'Swimming client persona': { layout: 'cards', ownPages: false },
  default: { layout: 'none' },
};
```

| Option | Meaning |
| --- | --- |
| `layout` | `gallery` · `list` · `cards` · `table` · `testimonial` · `none` |
| `ownPages` | `true` (default) — every row gets its own page at `/<slug>/`.<br>`false` — rows render inline on the index only. |
| `tagProperty` | Property shown as a pill (gallery layout). |
| `heading` | Overrides the section heading on the index. |
| `intro` | A standalone answer sentence rendered above the section. |

Set `default` to `{ layout: 'none' }` to make newly-discovered databases **opt-in** —
otherwise a database you add in Notion later starts publishing on the next deploy.

### `ownPages: false` and thin content

Rows whose "body" is just a short label — audience personas, one-line testimonials —
should use `ownPages: false`. Giving each of them a standalone page creates thin pages
that dilute the site in search rather than helping it.

---

## URLs and slugs

Each routed row becomes `/<slug>/`, rendering that row's full body. No Notion hex IDs
appear in URLs.

- A **`Slug`** text property wins when present and non-empty.
- Otherwise the slug is derived from the row title.
- Titles that contain no Latin characters (e.g. `肥躉`) slugify to nothing, so they fall
  back to `item-<short id>`. **Add a `Slug` property to those rows** for a readable URL.
- Collisions get a `-2`, `-3` suffix.

---

## SEO / GEO

Built in per page: `<title>`, meta description (first real paragraph of the row body),
`<link rel="canonical">`, Open Graph + Twitter tags, and `sitemap.xml`.

JSON-LD: a site-level `LocalBusiness` (with `areaServed` from `location`) on every page,
a `Service` schema on each row page, `FAQPage` on the index when `faq` is non-empty, and
`Review` microdata in the testimonial layout.

For AI citation, lead each section and FAQ answer with a **standalone, self-contained
sentence** — one that still makes sense quoted with no surrounding context — and use
specific service names ("puppy potty training", "pre-schooler swimming lessons") in
headings rather than generic ones.

### Contact / CTA

The template renders what's in Notion and nothing more. It never injects a booking
button or a contact form.

> **Notion button blocks are not returned by the Notion API.** They come back as
> `unsupported` and cannot be rendered. Any call-to-action you need on the site must be
> a **link, bookmark, or link inside a callout** in Notion — those render fine. Check
> your page for button blocks before assuming a CTA survived the build.

### Images

Notion serves uploaded files from S3 behind **signed URLs that expire within the hour**.
The fetch step downloads them into `public/notion-assets/`, content-hashed, and rewrites
the URLs — otherwise every image would 404 shortly after deploy. Externally-hosted
images are left pointing at their original URL.

---

## Deploy on Railway

1. **New Project** → **Deploy from GitHub repo** → pick your site repo.
2. **Variables** → add `NOTION_TOKEN`, `NOTION_PAGE_ID`, `DOMAIN`.
3. Build and start commands come from [`railway.json`](railway.json):
   - build: `npm ci && npm run build`
   - start: `npm start` (binds Railway's `$PORT`)
4. **Settings → Networking → Generate Domain** for a `*.up.railway.app` URL.
   Set `DOMAIN` to it and redeploy so canonical URLs and the sitemap match.

### Custom domain

**Settings → Networking → Custom Domain**, enter the hostname, then add the `CNAME`
Railway shows you at your DNS provider. Once it resolves, update `DOMAIN` to the custom
origin and redeploy — canonical tags and `sitemap.xml` are baked in at build time and
will otherwise still point at the old origin.

### Manual redeploy

Railway dashboard → the service → **Deployments** → **⋯** on the latest → **Redeploy**.
Or `railway up` from the repo. Either way the full pipeline reruns and pulls current
Notion content. Pushing to the connected branch also triggers a deploy.

---

## Creating a new site from this template

1. **Use this template** → new repo (private is fine; the template stays public).
2. Edit `site.config.mjs`: name, tagline, location, schemaType, FAQ.
3. Set the database-to-layout map for that site's databases.
4. Restyle by overriding the CSS custom properties at the top of
   [`src/styles/base.css`](src/styles/base.css) — colours, fonts, spacing, radius.
   Styling is isolated from the pipeline, so a restyle never touches content code.
5. Add `.env` locally, then the same three variables in Railway.
6. Deploy, generate a domain, set `DOMAIN`, redeploy.

---

## Security

- `.env` and every `.env.*` except `.env.example` are gitignored.
- Build output (`dist/`, `.astro/`, `src/data/notion.json`, `public/notion-assets/`) is
  gitignored — the Notion snapshot never lands in git.
- The token is read from the environment only, never written to a file the build emits.
- Use a **read-only** integration: even if the token leaks, it cannot modify Notion.

## Robustness

Notion allows roughly 3 requests/second. Every API call is paced (~340ms apart) and
retried up to 5 times on `429` and `5xx`, honouring `Retry-After` and otherwise backing
off exponentially with jitter. A failed image download logs a warning and keeps the
remote URL rather than failing the build. A `404` prints the likely cause — the
integration hasn't been added to the page under **⋯ → Connections**.
