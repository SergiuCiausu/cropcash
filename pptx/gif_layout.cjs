// Measures the demo-deck slide template in a browser, so build_gif_deck.py can place native
// PowerPoint text and shapes exactly where the video slides had them.
// Usage: node gif_layout.cjs <job.json>   job: {template, out, background, slides: [{id, slide_data}]}
const fs = require('fs');
const { chromium } = require(process.env.USERPROFILE.replace(/\\/g, '/') + '/.claude/skills/demo-deck/node_modules/playwright');

const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

(async () => {
  const browser = await chromium.launch();
  const out = {};
  for (const { id, slide_data } of job.slides) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    await page.addInitScript((d) => { window.__SLIDE = d; }, slide_data);
    await page.goto('file://' + job.template);
    await page.waitForFunction(() => window.__ready === true);
    await page.evaluate(async () => { await document.fonts.ready; });
    out[id] = await page.evaluate(() => {
      document.getAnimations().forEach((a) => a.finish());
      const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
      const text = (el) => {
        const c = getComputedStyle(el);
        return { ...box(el), text: el.innerText, size: parseFloat(c.fontSize), line: parseFloat(c.lineHeight), spacing: parseFloat(c.letterSpacing) || 0, weight: +c.fontWeight, color: c.color, align: c.textAlign };
      };
      // The browser's own (balanced) line breaks, so PowerPoint doesn't leave one word on a line.
      const lines = (el) => {
        const node = el.firstChild, value = node.textContent, out = [];
        let start = 0, top = null;
        for (let i = 0; i < value.length; i++) {
          if (value[i] === ' ') continue;
          const range = document.createRange();
          range.setStart(node, i);
          range.setEnd(node, i + 1);
          const y = Math.round(range.getBoundingClientRect().top);
          if (top !== null && Math.abs(y - top) > 4) { out.push(value.slice(start, i).trim()); start = i; }
          top = y;
        }
        out.push(value.slice(start).trim());
        return out;
      };
      const one = (q, fn = box) => { const el = document.querySelector(q); return el ? fn(el) : null; };
      const all = (q, fn = box) => [...document.querySelectorAll(q)].map(fn);
      return {
        kicker: one('.kicker', text), title: one('h1', (el) => ({ ...text(el), lines: lines(el) })), sub: one('.sub', text), cta: one('.cta', text),
        value: one('.value', text), label: one('.label', (el) => ({ ...text(el), lines: lines(el) })),
        points: one('ul.points'), bullets: all('ul.points li', text), rule: one('.rule'), logo: one('.stage .logo'),
        window: one('.window'), bar: one('.bar'), dots: all('.bar i'), url: one('.bar .url', text), slot: one('[data-slot]'),
        footer: one('.footer span:first-child', text), footerLogo: one('.footer img'),
      };
    });
    if (id === job.slides[0].id) {
      await page.evaluate(() => { document.getElementById('root').style.display = 'none'; });
      await page.screenshot({ path: job.background });
    }
    await page.close();
  }
  await browser.close();
  fs.writeFileSync(job.out, JSON.stringify(out, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
