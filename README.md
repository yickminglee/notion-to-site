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
| `sharp` | 0.35.3 (favicon downscaling) |
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

| Variable | Required | What it is |
| --- | --- | --- |
| `NOTION_TOKEN` | yes | The integration token. Secret. |
| `NOTION_PAGE_ID` | yes | The page to build from (32 hex chars, with or without dashes). |
| `DOMAIN` | no | Public origin, no trailing slash. Drives canonical URLs and the sitemap. On Railway, leave it unset — you have no domain until after the first deploy, and Railway's own `RAILWAY_PUBLIC_DOMAIN` is picked up automatically. Set it only for a custom domain. See [Deploy on Railway](#deploy-on-railway). |

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
| `layout` | `gallery` · `list` · `cards` · `table` · `testimonial` · `detail` · `none` |
| `ownPages` | `true` (default) — every row gets its own page at `/<slug>/`.<br>`false` — rows render inline on the index only. |
| `tagProperty` | Property shown as a pill (gallery layout). |
| `heading` | Overrides the section heading on the index. |
| `intro` | A standalone answer sentence rendered above the section. |

Gallery rows normally use their Notion **cover** image. When the picture, the blurb or
the link live in row *properties* instead — as they do for a product list — point the
layout at them:

| Option | Meaning |
| --- | --- |
| `imageProperty` | Files property to use as the picture, instead of the row cover. |
| `bodyProperty` | Text property shown under the title. Line breaks are kept. |
| `linkProperty` | Link property. A bare URL becomes a link; anything else (a "copy this into the app" note, say) is shown verbatim, since the words around the URL are usually what makes it work. |
| `imageFit` | `cover` (default) crops to fill; `contain` shows the whole image — better for product shots. |

`detail` renders each row's **full body** inline. Use it for databases whose value is
in the body rather than a summary — pricing tiers, policies — where a `list` excerpt
would show only a lead-in like "Group lesson:". Pair it with `ownPages: false`.

Set `default` to `{ layout: 'none' }` to make newly-discovered databases **opt-in** —
otherwise a database you add in Notion later starts publishing on the next deploy.

### `ownPages: false` and thin content

Rows whose "body" is just a short label — audience personas, one-line testimonials —
should use `ownPages: false`. Giving each of them a standalone page creates thin pages
that dilute the site in search rather than helping it.

---

## URLs and slugs

Each database row **and each Notion sub-page** becomes `/<slug>/`, rendering its full
body. Sub-pages (`child_page` blocks) are linked from wherever they appear in the parent
page — with their Notion icon — and are included in `sitemap.xml`. A `child_page` block
carries only a title, so each sub-page is fetched separately for its icon and cover. They get no `Service` schema — a policy or guide
page is supporting material, not a service offering. No Notion hex IDs appear in URLs.

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
a `Service` schema on each row page, `FAQPage` on any page that has an FAQ, and
`Review` microdata in the testimonial layout.

For AI citation, lead each section and FAQ answer with a **standalone, self-contained
sentence** — one that still makes sense quoted with no surrounding context — and use
specific service names ("puppy potty training", "pre-schooler swimming lessons") in
headings rather than generic ones.

### FAQ

Write the FAQ **in Notion**, not in config: add a heading whose text starts with `FAQ`
(or `Frequently asked`), then write the questions under it. Three forms are recognised,
so use whichever is natural:

| Form | Question | Answer |
| --- | --- | --- |
| **Toggles** (tidiest) | the toggle title | the toggle's contents |
| **Sub-headings** | the heading | the blocks under it |
| **Paragraph pairs** | a paragraph ending in `?` | the paragraphs after it |

Collection stops at the next heading of the same or higher level, so the FAQ can sit
anywhere on the page.

Those blocks render as ordinary page content, and the build also emits `FAQPage`
JSON-LD from them. The FAQ therefore stays editable in Notion like everything else, and
the structured data follows on the next build.

Each page is read separately: an FAQ inside a sub-page or a database row produces the
`FAQPage` schema **on that page**, not on the index. Google requires the structured data
to match what a visitor actually sees on the URL, so a long guide with its own FAQ gets
its own — and the index claims only the questions it really shows.

Override the heading pattern with `site.faqHeading` for another language or wording
(e.g. `/^常見問題/`). The `faq` array in `site.config.mjs` is a **fallback only**, for a
site with no FAQ in its Notion page — content there does not live in Notion, will not
update when the page does, and is published in the site owner's voice, so prefer the
Notion route. A Notion FAQ always wins over the array.

### Contact / CTA

The template renders what's in Notion and nothing more. It never injects a booking
button or a contact form.

> **Notion button blocks carry no label or URL.** The API returns
> `{ block_type: "button" }` and nothing else — no text, no link, no children. Notion's
> own HTML export drops them too, so there is no automated source for the link.

Because the API *does* return each button's block id and position, a button can still be
restored by supplying its link once in the `buttons` map in `site.config.mjs` — it then
renders as a real anchor in its original place in the page:

```js
export const buttons = {
  default: { label: 'WhatsApp me', url: 'https://wa.me/85200000000' },
  '60c4b82e-…': { label: 'Book a trial', url: 'https://wa.me/…' }, // overrides default
};
```

`npm run fetch` lists every button id it finds, so you can key overrides off them. Leave
the map empty and buttons render nothing. This is the only place a site adds something
that is not in the Notion content, and it exists purely to restore a CTA the API drops.
A plain **link, bookmark, or link inside a callout** in Notion needs none of this and
renders automatically.

### Other blocks the API won't return

Buttons are not the only blocks Notion returns as `unsupported`. Google Drive embeds do
the same, and they arrive with no URL either — so they are **missing from the built
site**. `npm run fetch` names each one and its kind, so a page never loses content
silently:

```
  2 block(s) the Notion API will not return, so they are
  MISSING from the site. …
    drive        39c4b82e-cbe5-8035-…
```

Give one a `label` and `url` in the same `buttons` map to render it as a link, or swap
it in Notion for a block the API does return — a bookmark, or a plain link. Unlike
buttons, these are **not** covered by the `default` entry: an embedded document is not a
call to action, so inheriting the site-wide button link would put a "WhatsApp me" where
a spreadsheet used to be. Each one has to be named explicitly.

### Favicon

The browser-tab icon comes from the Notion page icon automatically. An uploaded image is
downscaled at build time to a 32px favicon and a 180px apple-touch-icon — a raw Notion
icon is often ~1000px and several hundred KB, far too heavy to serve on every page load.
An emoji page icon is wrapped in an inline SVG data URI instead, so it works as a favicon
with no file at all. No page icon means no favicon tags are emitted.

### Images

Notion serves uploaded files from S3 behind **signed URLs that expire within the hour**.
The fetch step downloads them into `public/notion-assets/`, content-hashed, and rewrites
the URLs — otherwise every image would 404 shortly after deploy. Externally-hosted
images are left pointing at their original URL.

---

## Deploy on Railway

You do not have a domain until after the first deploy, so these are **three separate
steps in this order**. Don't try to set `DOMAIN` up front — step 2 gives you one.

### Step 1 — First deploy (no domain yet)

1. **New Project** → **Deploy from GitHub repo** → pick your site repo.
2. **Variables** → add **only these two**:
   - `NOTION_TOKEN`
   - `NOTION_PAGE_ID`

   Leave `DOMAIN` unset. The build warns that canonical URLs point at a placeholder —
   that is expected here and fixed by step 2.
3. Build and start commands come from [`railway.json`](railway.json):
   - build: `npm run build` (Nixpacks runs `npm ci` itself — do **not** add it to
     `buildCommand`, or the second `npm ci` fails with `EBUSY` trying to remove
     `node_modules/.cache` while Railway has it mounted as a build cache)
   - start: `npm start` (binds Railway's `$PORT`)

The site is now live but has no public URL yet.

### Step 2 — Generate a domain, then redeploy

1. **Settings → Networking → Generate Domain** → a `*.up.railway.app` URL.
2. **Redeploy** (see below).

That second deploy is what makes the URLs correct. Railway sets `RAILWAY_PUBLIC_DOMAIN`
once the domain exists, and the build reads it automatically — **you do not need to set
`DOMAIN` yourself.** Canonical tags and `sitemap.xml` are baked in at build time, so
they only pick up the new origin on the redeploy, not the moment you generate it.

### Step 3 — Custom domain (optional, later)

1. **Settings → Networking → Custom Domain** → enter the hostname.
2. Add the `CNAME` Railway shows you at your DNS provider and wait for it to resolve.
3. **Now** set `DOMAIN` to the custom origin (e.g. `https://swim.example.com`) — an
   explicit `DOMAIN` overrides `RAILWAY_PUBLIC_DOMAIN`.
4. **Redeploy**, or canonicals and the sitemap keep pointing at the `railway.app` origin.

### Manual redeploy

Railway dashboard → the service → **Deployments** → **⋯** on the latest → **Redeploy**.
Or `railway up` from the repo. Either way the full pipeline reruns and pulls current
Notion content. Pushing to the connected branch also triggers a deploy.

### Troubleshooting

**Build fails with `EBUSY: resource busy or locked, rmdir '/app/node_modules/.cache'`**
Your `buildCommand` runs `npm ci`. Nixpacks already installs in its own phase, and the
second `npm ci` tries to delete `node_modules` while Railway has `node_modules/.cache`
mounted as a build cache. Set `buildCommand` to `npm run build` alone.

**Build fails with `API token is invalid`**
`NOTION_TOKEN` is wrong — most often the `ntn_xxxx…` placeholder from `.env.example`
pasted in verbatim. A real token is ~50 characters. Also confirm the integration was
added to the page under **⋯ → Connections**.

**Deploy succeeds, logs show `serving dist/`, but the URL returns 502
"Application failed to respond"**
The domain's **target port** doesn't match the port the app listens on. This happens when
the domain is generated before the first successful deploy: Railway has no running process
to detect, so it guesses. Check it:

```bash
railway status --json | grep -o '"targetPort":[0-9]*'
```

Compare that with the port in the deploy log (`serving dist/ on http://0.0.0.0:<port>`).
If they differ, either change the target port under **Settings → Networking**, or set a
`PORT` service variable to the target port — `server.mjs` honours `PORT`, so the app moves
to meet the proxy.

### Which origin am I building against?

| `DOMAIN` | `RAILWAY_PUBLIC_DOMAIN` | Origin used |
| --- | --- | --- |
| unset | unset | `https://example.com` + a build warning (first deploy) |
| unset | set by Railway | `https://<your>.up.railway.app` |
| set | either | `DOMAIN` wins |

---

## Creating a new site from this template

1. **Use this template** → new repo (private is fine; the template stays public).
2. Edit `site.config.mjs`: name, tagline, location, schemaType, FAQ.
3. Set the database-to-layout map for that site's databases.
4. Restyle in [`src/styles/theme.css`](src/styles/theme.css) — override the custom
   properties (colours, fonts, spacing, radius) and add site-specific rules. It loads
   after `base.css` so your overrides win, and it is the only file a restyle touches:
   styling is fully isolated from the pipeline and the content.

   The default theme is **"notion"**: it reproduces Notion's own look — the warm
   near-black `rgb(55,53,47)`, the Inter-led sans stack, 10px callout radius, 46px
   column gap, and the full block-colour palette, all taken from Notion's HTML export.
   A site built from a Notion page looks like that page out of the box. Replace the
   file wholesale for a site that should look like something else.
5. Add `.env` locally; on Railway add `NOTION_TOKEN` and `NOTION_PAGE_ID` only.
6. Deploy (step 1), generate a domain and redeploy (step 2). Add a custom domain later
   (step 3) — that is the only time you set `DOMAIN` by hand.

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
