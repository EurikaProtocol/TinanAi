import './globals.css';
import type { Metadata } from 'next';
import Providers from '@/components/Providers';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.tinaneureka.com'),
  title: 'TINAN AI — Eureka Tokenization DApp',
  description: 'EUREKA — A Brighter Tomorrow. TINAN AI helps you plan and tokenize projects. Not Artificial Intelligence. Natural Intelligence.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
