/** Notion rich_text -> safe HTML. */

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Only allow schemes that are safe to place in href. Blocks javascript: etc.
 * Returns the URL unescaped, for contexts that escape their own attributes —
 * .astro templates do, and escaping here as well would turn the `&` in a query
 * string into `&amp;amp;`.
 */
export function safeUrl(url) {
  const trimmed = String(url ?? '').trim();
  return /^(https?:|mailto:|tel:|\/|#)/i.test(trimmed) ? trimmed : null;
}

/** As safeUrl, but escaped for interpolation into a raw HTML string. */
function safeHref(url) {
  const safe = safeUrl(url);
  return safe === null ? null : escapeHtml(safe);
}

export function renderRichText(rich) {
  if (!Array.isArray(rich)) return '';

  return rich
    .map((token) => {
      // Custom emoji arrive as mention tokens carrying an image URL; their
      // plain_text is the bare `:shortcode:`, which must not be shown raw.
      if (token.type === 'mention' && token.mention?.type === 'custom_emoji') {
        const emoji = token.mention.custom_emoji ?? {};
        const src = safeHref(emoji.url);
        if (!src) return '';
        return `<img class="nt-emoji" src="${src}" alt="${escapeHtml(emoji.name ?? '')}" loading="lazy" decoding="async" />`;
      }

      // Notion stores soft line breaks (shift+enter) as \n inside rich text.
      // HTML collapses those to spaces, so make them explicit.
      let html = escapeHtml(token.plain_text).replace(/\n/g, '<br />');
      const a = token.annotations ?? {};

      if (a.code) html = `<code>${html}</code>`;
      if (a.bold) html = `<strong>${html}</strong>`;
      if (a.italic) html = `<em>${html}</em>`;
      if (a.strikethrough) html = `<s>${html}</s>`;
      if (a.underline) html = `<u>${html}</u>`;
      if (a.color && a.color !== 'default') {
        html = `<span class="nt-c-${escapeHtml(a.color)}">${html}</span>`;
      }

      const href = safeHref(token.href);
      if (href) {
        const external = /^https?:/i.test(href);
        const rel = external ? ' rel="noopener noreferrer"' : '';
        html = `<a href="${href}"${rel}>${html}</a>`;
      }
      return html;
    })
    .join('');
}

/**
 * Flatten rich text to plain text — for meta descriptions and alt text.
 * Custom-emoji mentions are dropped so `:shortcode:` never leaks into a
 * <title> or meta description.
 */
export const toPlain = (rich) =>
  Array.isArray(rich)
    ? rich
        .filter((t) => !(t.type === 'mention' && t.mention?.type === 'custom_emoji'))
        .map((t) => t.plain_text)
        .join('')
    : '';
