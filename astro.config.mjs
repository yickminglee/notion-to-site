import './scripts/load-env.mjs';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const domain = (process.env.DOMAIN ?? 'https://example.com').replace(/\/$/, '');

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
