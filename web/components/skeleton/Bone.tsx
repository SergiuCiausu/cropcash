/* The grey blocks a skeleton is made of (styles/skeleton.css). Only shapes, no text, so a page's
   skeleton can sit in the static HTML and look like the page before its scripts fill it. */
import type { CSSProperties } from 'react';

type Size = number | string;
const px = (v: Size | undefined) => (typeof v === 'number' ? `${v}px` : v);

/** One block. w: width (px or any CSS length, default 100%); h: height in px; r: corner radius. */
export function Bone({ w, h = 14, r, className }: { w?: Size; h?: Size; r?: Size; className?: string }) {
  const style: CSSProperties = { width: px(w), height: px(h), borderRadius: px(r) };
  return <span className={className ? `bone ${className}` : 'bone'} style={style} />;
}

/** Lines of text; the last one is shorter, as a paragraph's is. */
export function BoneText({ lines = 2, h = 12, last = '60%' }: { lines?: number; h?: number; last?: Size }) {
  return (
    <span className="bone-text">
      {Array.from({ length: lines }, (_, i) => (
        <Bone key={i} h={h} w={i === lines - 1 && lines > 1 ? last : undefined} />
      ))}
    </span>
  );
}

/** A card in the page's bento grid (span: s5, s7, s12, …), with a title and some lines. */
export function BoneCard({ span = 's12', lines = 3, h, children }: { span?: string; lines?: number; h?: number; children?: React.ReactNode }) {
  return (
    <section className={`card ${span} bone-card`} style={h ? { minHeight: h } : undefined}>
      <Bone w="40%" h={18} />
      {children ?? <BoneText lines={lines} />}
    </section>
  );
}
