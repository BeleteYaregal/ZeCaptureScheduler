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
  icons: { icon: '/icon.svg', apple: '/icon-192.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
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
