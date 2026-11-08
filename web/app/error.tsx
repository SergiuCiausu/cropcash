'use client';
/* A React page that crashed or lost its code: one reload for missing code, then a card (FAIL-06). */
import { useEffect } from 'react';
import PageFailed from '../components/PageFailed';
import { reloadOnce, tabStore } from '../lib/boot-retry';

export default function PageError({ error, reset }: { error: Error; reset: () => void }) {
  const reloading = typeof window !== 'undefined' && reloadOnce(error, tabStore(), () => location.reload());
  useEffect(() => {
    console.error('page failed', error);
  }, [error]);
  return reloading ? null : <PageFailed onRetry={reset} />;
}
