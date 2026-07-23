/**
 * Media URLs that Notion stores as a bare `embed` or `video` block.
 *
 * Two separate questions, because they have different answers:
 *
 *   embedFrame(url)   — can we legitimately iframe this? Only for providers
 *                       that serve a real player to a logged-out visitor.
 *   embedLabel(url)   — failing that, what should the link say?
 *
 * Instagram is deliberately NOT embeddable. Its /embed endpoint 302s to
 * accounts/login for anyone without a session, so an iframe would show a login
 * wall in place of the post. It gets a labelled link instead.
 */

/**
 * An iframe src for providers whose /embed endpoint works logged-out, or null.
 * The frame is cross-origin, so the provider's script runs in its own frame and
 * this page ships no JS of its own.
 */
export function embedFrame(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '');
  const path = url.pathname.replace(/\/+$/, '');

  // YouTube watch / shorts / embed links, and youtu.be short links.
  if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
    const id = url.searchParams.get('v') || path.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1];
    if (id) return { src: `https://www.youtube.com/embed/${id}`, provider: 'video' };
  }
  if (host === 'youtu.be') {
    const id = path.slice(1).split('/')[0];
    if (id) return { src: `https://www.youtube.com/embed/${id}`, provider: 'video' };
  }

  // Vimeo.
  if (host === 'vimeo.com') {
    const id = path.match(/^\/(\d+)/)?.[1];
    if (id) return { src: `https://player.vimeo.com/video/${id}`, provider: 'video' };
  }

  return null;
}

/**
 * A readable label for a media link, so a block that can't be embedded doesn't
 * render as a raw URL. Returns null when we have nothing better to say than the
 * URL itself — the caller falls back to the caption, then to the URL.
 */
export function embedLabel(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '');
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) {
    const kind = url.pathname.match(/^\/(p|reel|tv)\//)?.[1];
    return kind === 'reel' ? 'Watch the reel on Instagram' : 'View on Instagram';
  }
  return null;
}
