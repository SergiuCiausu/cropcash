'use client';
/* A link to another app page. On Ion's farm it stays under /ferma-lui-ion (lib/paths.ts), so a
   page body can be shared by both routes. Plain <a>: each page loads fresh, as the scripts expect. */
import { createContext, useContext, type AnchorHTMLAttributes } from 'react';
import { appHref, type Mode } from '../lib/paths';

export const ModeContext = createContext<Mode>('farm');

export default function AppLink({ href, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a href={appHref(href, useContext(ModeContext))} {...rest} />;
}
