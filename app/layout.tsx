import './globals.css';
import type { Metadata, Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'TINAN AI — Build anything with AI',
  description: 'Turn your ideas into reviewable project plans and generated web projects with TINAN AI.',
  openGraph: {
    title: 'TINAN AI — Natural Intelligence',
    description: 'Turn your ideas into reviewable project plans and generated web projects with TINAN AI.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TINAN AI — Natural Intelligence',
    description: 'Turn your ideas into reviewable project plans and generated web projects with TINAN AI.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
