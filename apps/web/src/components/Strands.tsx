import { useEffect, useRef } from 'react';

/**
 * Light strands behind the balance card (ported from the prototype's 1-lights idea).
 * Decorative only: paused off-screen, static with reduced motion, fewer strands on small screens.
 */
export function Strands() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    let w = 0;
    let h = 0;
    let d = 1;
    let base: HTMLCanvasElement | null = null;
    let tracks: [number, number][][] = [];
    let sparks: { tr: [number, number][]; t: number; v: number; gold: boolean }[] = [];
    let running = false;
    let frame = 0;

    const build = () => {
      const r = c.getBoundingClientRect();
      if (!r.width) return;
      w = r.width;
      h = r.height;
      d = Math.min(devicePixelRatio || 1, 2);
      c.width = w * d;
      c.height = h * d;
      base = document.createElement('canvas');
      base.width = c.width;
      base.height = c.height;
      const s = base.getContext('2d');
      if (!s) return;
      s.setTransform(d, 0, 0, d, 0, 0);
      s.globalCompositeOperation = 'lighter';
      tracks = [];
      const n = Math.min(w < 500 ? 320 : 620, Math.round(w * 1.3));
      for (let i = 0; i < n; i++) {
        const t = Math.random();
        const p0: [number, number] = [w * (0.34 + t * 0.3), h + 8];
        const p3: [number, number] = [w * (0.74 + t * 0.4), -8 - t * h * 0.1];
        const c1 = [p0[0] + rand(10, 60), h * rand(0.55, 0.8)] as const;
        const c2 = [p3[0] - rand(20, 90), h * rand(0.15, 0.4)] as const;
        const pts: [number, number][] = [];
        for (let k = 0; k <= 26; k++) {
          const u = k / 26;
          const m = 1 - u;
          pts.push([
            m * m * m * p0[0] + 3 * m * m * u * c1[0] + 3 * m * u * u * c2[0] + u * u * u * p3[0] + Math.sin(u * 7 + i) * 3 * u,
            m * m * m * p0[1] + 3 * m * m * u * c1[1] + 3 * m * u * u * c2[1] + u * u * u * p3[1],
          ]);
        }
        s.strokeStyle = Math.random() < 0.22 ? `rgba(255,205,125,${rand(0.05, 0.2)})` : `rgba(190,215,255,${rand(0.04, 0.2)})`;
        s.lineWidth = rand(0.25, 0.7);
        s.beginPath();
        pts.forEach((p, k) => (k ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])));
        s.stroke();
        if (i % 4 === 0) tracks.push(pts);
      }
      sparks = Array.from({ length: reduced ? 0 : 42 }, () => ({
        tr: tracks[Math.floor(Math.random() * tracks.length)]!,
        t: Math.random(),
        v: rand(0.0015, 0.0045),
        gold: Math.random() < 0.5,
      }));
      paint();
    };

    const paint = () => {
      if (!base) return;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, c.width, c.height);
      g.drawImage(base, 0, 0);
      g.setTransform(d, 0, 0, d, 0, 0);
      g.globalCompositeOperation = 'lighter';
      for (const p of sparks) {
        p.t += p.v;
        if (p.t > 1) p.t = 0;
        const q = p.tr[Math.floor(p.t * 26)]!;
        const a = Math.min(1, Math.min(p.t, 1 - p.t) * 7);
        g.fillStyle = p.gold ? `rgba(255,205,125,${a})` : `rgba(215,235,255,${a})`;
        g.beginPath();
        g.arc(q[0], q[1], 1.2, 0, 7);
        g.fill();
      }
      g.globalCompositeOperation = 'source-over';
    };

    const loop = () => {
      if (!running) return;
      paint();
      frame = requestAnimationFrame(loop);
    };

    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting && !base) build();
      running = !!e?.isIntersecting && !reduced;
      if (running) frame = requestAnimationFrame(loop);
    });
    io.observe(c);

    let lastW = innerWidth;
    let timer = 0;
    const onResize = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (innerWidth !== lastW) {
          lastW = innerWidth;
          build();
        }
      }, 150);
    };
    addEventListener('resize', onResize);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      io.disconnect();
      removeEventListener('resize', onResize);
      clearTimeout(timer);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" />;
}
