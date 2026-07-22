/**
 * PER-SITE CONFIG — the only file you edit when creating a new site from this template.
 * Secrets live in .env (NOTION_TOKEN, NOTION_PAGE_ID, DOMAIN), never here.
 */

export const site = {
  /** Brand name. Used in <title>, LocalBusiness schema, header. */
  name: 'Example Studio',

  /** One line under the hero. Also the fallback meta description. */
  tagline: 'A short, specific description of what you do.',

  /** Drives SEO copy and LocalBusiness `areaServed`. */
  location: 'Hong Kong',

  /** BCP-47 language tag for <html lang>. */
  lang: 'en',

  /**
   * schema.org type for the JSON-LD block. `LocalBusiness` is the safe default;
   * narrow it (SportsActivityLocation, ProfessionalService…) for a better rich result.
   */
  schemaType: 'LocalBusiness',

  /** Label for this site's look. The actual styling lives in src/styles/theme.css. */
  theme: 'default',
};

/**
 * DATABASE-TO-LAYOUT MAP
 * ----------------------
 * The Notion API does not expose views, so the layout is chosen here instead.
 * Each inline database found on the source page is matched by its Notion title.
 *
 *   layout    — one of: gallery | list | cards | table | testimonial | none
 *   ownPages  — true  : every row becomes its own page at /<slug>/ with its full body
 *               false : rows render inline on the index only (no separate pages).
 *                       Use for short label-like rows (personas, testimonials) where
 *                       a standalone page would be thin content and hurt SEO.
 *   heading   — optional override for the section heading on the index page.
 *   intro     — optional standalone answer sentence rendered above the section.
 *               Written for AI citation: self-contained, no anaphora.
 *
 * Matching is case-insensitive on the database title. `default` catches anything
 * discovered that is not listed — set it to `none` to make new databases opt-in.
 */
export const databaseLayouts = {
  default: { layout: 'list', ownPages: true },
};

/**
 * NOTION BUTTON BLOCKS
 * --------------------
 * The Notion API returns button blocks as `unsupported` with no label, URL or
 * children — the payload is literally `{ block_type: "button" }`. Notion's own
 * HTML export drops them as well, so there is no automated source for the link.
 *
 * The API does give each button's block id and its position in the page, so a
 * button renders in exactly the right place once its link is supplied here.
 *
 *   default  — used for every button that has no specific entry.
 *   <blockId>— overrides `default` for that one button.
 *
 * Find the ids in the fetch output: `npm run fetch` lists every button it saw.
 * Leave this empty and buttons render nothing, exactly as before.
 *
 * This is the one place the site adds something not in the Notion content, and
 * it exists only to restore a CTA that Notion's own API drops — not to invent one.
 */
export const buttons = {
  // default: { label: 'Message me on WhatsApp', url: 'https://wa.me/85200000000' },
  // 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee': { label: 'Book a trial', url: 'https://wa.me/…' },
};

/**
 * FAQ — rendered as an accessible <dl> plus FAQPage JSON-LD.
 * Lead each answer with a standalone sentence that makes sense quoted alone.
 */
export const faq = [
  // { q: 'Where are lessons held?', a: 'Lessons are held at …' },
];
