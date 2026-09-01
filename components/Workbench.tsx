'use client';

import { useEffect } from 'react';
import { useStore } from '@/lib/store';
import { WebMCPProvider } from '@/components/WebMCPProvider';
import { Header } from '@/components/Header';
import { WebMCPBanner } from '@/components/WebMCPBanner';
import { Queue } from '@/components/Queue';
import { PageViewer } from '@/components/PageViewer';
import { InspectorTabs } from '@/components/InspectorTabs';
import { CountersignCard } from '@/components/CountersignCard';

export function Workbench() {
  const hydrated = useStore((s) => s.hydrated);

  useEffect(() => {
    useStore.persist.rehydrate();
  }, []);

  return (
    <div className="flex min-h-screen flex-col min-[1100px]:h-screen">
      <WebMCPProvider />
      <Header />
      <WebMCPBanner />
      {hydrated ? (
        <main className="min-h-0 flex-1 min-[1100px]:grid min-[1100px]:grid-cols-[300px_minmax(0,1fr)_400px]">
          <Queue />
          <PageViewer />
          <InspectorTabs />
        </main>
      ) : (
        <main className="flex flex-1 items-center justify-center text-sm text-ink-faint" aria-busy="true">
          Loading the review queue…
        </main>
      )}
      <CountersignCard />
    </div>
  );
}
