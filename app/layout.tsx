import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

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
      <body className={inter.className}>{children}</body>
    </html>
  );
}
