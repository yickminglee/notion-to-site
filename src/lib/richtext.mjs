/** Notion rich_text -> safe HTML. */

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only allow schemes that are safe to place in href. Blocks javascript: etc. */
function safeHref(url) {
  const trimmed = String(url ?? '').trim();
  return /^(https?:|mailto:|tel:|\/|#)/i.test(trimmed) ? escapeHtml(trimmed) : null;
}

export function renderRichText(rich) {
  if (!Array.isArray(rich)) return '';

  return rich
    .map((token) => {
      let html = escapeHtml(token.plain_text);
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

/** Flatten rich text to plain text — for meta descriptions and alt text. */
export const toPlain = (rich) =>
  Array.isArray(rich) ? rich.map((t) => t.plain_text).join('') : '';
