export const dynamic = 'force-dynamic';

// The installed-app name follows the name the admin sets in Branding.
export async function GET() {
  let name = 'Callsheet';
  let color = '#1a56db';
  try {
    const r = await fetch(`${process.env.API_URL || 'http://127.0.0.1:4000'}/api/branding`, { cache: 'no-store' });
    if (r.ok) {
      const b = await r.json();
      if (typeof b.name === 'string' && b.name) name = b.name;
      if (typeof b.color === 'string') color = b.color;
    }
  } catch {
    /* backend not reachable: fall back to defaults */
  }
  return Response.json(
    {
      name,
      short_name: name.length > 12 ? name.slice(0, 12) : name,
      description: `${name}: schedule the videographer for your sales team`,
      start_url: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#f4f6fa',
      theme_color: color,
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    { headers: { 'content-type': 'application/manifest+json', 'cache-control': 'no-store' } }
  );
}
