import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/instrument-sans';
import './globals.css';
import { AuthProvider } from '@/components/Auth';
import { BrandProvider } from '@/lib/brand';
import { THEME_BOOT_SCRIPT, ThemeProvider } from '@/lib/theme';

export const metadata: Metadata = {
  title: 'Callsheet',
  description: 'Schedule the videographer for your sales team',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Callsheet', statusBarStyle: 'default' },
  icons: { icon: '/icon.svg', apple: '/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

const SW_REGISTER_SCRIPT = `
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('/sw.js').catch(function() {});
    });
  }
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Callsheet" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icon-192.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/icon-512.png" />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: SW_REGISTER_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>
          <BrandProvider>
            <AuthProvider>{children}</AuthProvider>
          </BrandProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
