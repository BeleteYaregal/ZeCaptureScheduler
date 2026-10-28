export const dynamic = 'force-dynamic';

// The installed-app name and icons follow the name and logo the admin sets in Branding.
export async function GET() {
  let name = 'CaptureSheet';
  let color = '#1a56db';
  let hasLogo = false;
  try {
    const apiUrl = process.env.API_URL || 'http://127.0.0.1:4000';
    const r = await fetch(`${apiUrl}/api/branding`, { cache: 'no-store' });
    if (r.ok) {
      const b = await r.json();
      if (typeof b.name === 'string' && b.name) name = b.name;
      if (typeof b.color === 'string') color = b.color;
      if (b.logo) hasLogo = true;
    }
  } catch {
    /* backend not reachable: fall back to defaults */
  }

  const iconUrl = hasLogo ? '/api/branding/icon' : '/icon-192.png';
  const icon512Url = hasLogo ? '/api/branding/icon' : '/icon-512.png';

  return Response.json(
    {
      id: '/',
      scope: '/',
      name,
      short_name: name.length > 12 ? name.slice(0, 12) : name,
      description: `${name}: schedule the videographer for your sales team`,
      start_url: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#f4f6fa',
      theme_color: color,
      prefer_related_applications: false,
      categories: ['business', 'productivity'],
      icons: [
        { src: iconUrl, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: icon512Url, sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: icon512Url, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      ],
      screenshots: [
        { src: '/screenshot-mobile.png', sizes: '720x1280', type: 'image/png', form_factor: 'narrow' },
        { src: '/screenshot-wide.png', sizes: '1280x720', type: 'image/png', form_factor: 'wide' },
      ],
    },
    { headers: { 'content-type': 'application/manifest+json', 'cache-control': 'no-store' } }
  );
}
