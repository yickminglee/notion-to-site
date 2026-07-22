import './scripts/load-env.mjs';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

/**
 * Resolve the public origin, in priority order:
 *
 *   1. DOMAIN                 — set this once you attach a custom domain.
 *   2. RAILWAY_PUBLIC_DOMAIN  — set by Railway automatically once the service
 *                               has a domain. Means the first deploy needs no
 *                               DOMAIN variable at all: deploy, generate a
 *                               domain, redeploy, and canonicals are correct.
 *   3. a placeholder          — only reachable before any domain exists.
 *
 * Canonical tags and sitemap.xml are baked in at build time, so whenever the
 * origin changes you must redeploy for them to catch up.
 */
const PLACEHOLDER = 'https://example.com';

const explicit = process.env.DOMAIN?.trim();
const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();

const resolved =
  explicit || (railway ? `https://${railway.replace(/^https?:\/\//, '')}` : PLACEHOLDER);

const domain = resolved.replace(/\/$/, '');

if (domain === PLACEHOLDER) {
  console.warn(
    '\n  No DOMAIN or RAILWAY_PUBLIC_DOMAIN set — canonical URLs and sitemap.xml\n' +
      `  will point at ${PLACEHOLDER}. Expected on a first deploy, before a domain\n` +
      '  exists. Generate a domain on Railway and redeploy to fix them.\n'
  );
}

export default defineConfig({
  // `site` drives canonical URLs and sitemap.xml.
  site: domain,
  output: 'static',
  integrations: [sitemap()],
  build: { format: 'directory' },
  vite: {
    define: {
      'import.meta.env.DOMAIN': JSON.stringify(domain),
    },
  },
});
