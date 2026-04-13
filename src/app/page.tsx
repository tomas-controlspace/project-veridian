'use client';

import { StoreProvider } from '@/lib/store';
import Dashboard from '@/components/Dashboard';

export default function Home() {
  return (
    <StoreProvider>
      <Dashboard />
    </StoreProvider>
  );
}
