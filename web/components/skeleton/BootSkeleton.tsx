/* The overlay a page shows until markReady() (lib/ui/ready.ts). Legacy and React screens share it.
   The shapes are hidden from screen readers, which hear one short status line instead. */
import type { ReactNode } from 'react';
import '../../styles/skeleton.css';

const TEXT = {
  loading: 'Se încarcă pagina…',
  noScript: 'CropCash are nevoie de JavaScript pornit în browser.',
};

export default function BootSkeleton({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="boot-skel">
        <p className="sr-only" role="status">{TEXT.loading}</p>
        <div aria-hidden="true">{children}</div>
      </div>
      <noscript>
        <p className="boot-nojs">{TEXT.noScript}</p>
      </noscript>
    </>
  );
}
