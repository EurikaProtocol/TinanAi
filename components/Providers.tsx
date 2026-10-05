'use client';
import { ReactNode } from 'react';
import { WalletProvider } from '@/lib/wallet';
import { Shell } from './Shell';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <Shell>{children}</Shell>
    </WalletProvider>
  );
}
