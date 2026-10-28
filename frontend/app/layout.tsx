import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/instrument-sans';
import './globals.css';
import { AuthProvider } from '@/components/Auth';
import { BrandProvider } from '@/lib/brand';
import { THEME_BOOT_SCRIPT, ThemeProvider } from '@/lib/theme';

export const metadata: Metadata = {
  title: 'CaptureSheet',
  description: 'Schedule the videographer for your sales team',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'CaptureSheet', statusBarStyle: 'default' },
  icons: { icon: '/api/branding/icon', apple: '/api/branding/icon' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

const SW_SCRIPT = `
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
        <link rel="apple-touch-icon" href="/api/branding/icon" />
        <link rel="icon" href="/api/branding/icon" />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: SW_SCRIPT }} />
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
