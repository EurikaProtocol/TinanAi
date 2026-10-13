import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'TINAN AI — Natural Intelligence',
  description: 'A thoughtful workspace for turning ideas into clear, reviewable plans.',
  openGraph: {
    title: 'TINAN AI — Natural Intelligence',
    description: 'A thoughtful workspace for turning ideas into clear, reviewable plans.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TINAN AI — Natural Intelligence',
    description: 'A thoughtful workspace for turning ideas into clear, reviewable plans.',
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
