'use client';
/* What the frame tells everything inside it: which page this is, whose farm, and how to link and notify. */
import { createContext } from 'react';
import type { Mode } from '../../lib/paths';
import type { Scope } from '../../lib/cc/plan';
import type { Message } from '../../lib/ui/messages';

export interface FrameInfo {
  /** "/salariu", whatever the prefix. */
  page: string;
  mode: Mode;
  scope: Scope;
  /** A link inside the visitor's mode (lib/paths.ts appHref). */
  href: (path: string) => string;
  /** Shows a toast (the old CC.notify). */
  notify: (n: Omit<Message, 'kind'> & { kind?: string }) => void;
}

export const FrameContext = createContext<FrameInfo>({ page: '/', mode: 'farm', scope: 'farm', href: (p) => p, notify: () => undefined });
