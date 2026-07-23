/**
 * Turn a pasted media URL into an iframe-embeddable src for the few providers
 * whose share link differs from their embed link. Returns null for anything
 * else, so the caller falls back to a plain link.
 *
 * Every provider here serves an `/embed` endpoint that allows framing, so the
 * embed needs no provider widget script on our page — the cross-origin iframe
 * renders itself, and our own page stays zero-JS.
 *
 *   provider 'video'     — 16:9, rendered full-width and responsive.
 *   provider 'instagram' — portrait post/reel chrome, rendered in a narrow card.
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

  // Instagram posts, reels and IGTV: the permalink plus /embed.
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) {
    const m = path.match(/^\/(p|reel|tv)\/([^/]+)/);
    if (m) return { src: `https://www.instagram.com/${m[1]}/${m[2]}/embed`, provider: 'instagram' };
  }

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
