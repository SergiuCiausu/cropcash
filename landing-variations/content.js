/*
  All landing page copy lives here. When the brief changes, edit this file
  and every variation updates. Page-specific layout stays in each HTML file.

  Slots:   <h1 data-c="hero.lineA"></h1>
  Lists:   <div data-each="steps"><template><h3 data-f="title"></h3></template></div>
  Icons:   <span data-icon="shield"></span>, or data-f-icon="icon" inside a list
*/
window.CONTENT = {
  brand: "Financial Futures",
  footnote: "Demo data, no real bank connected. Nothing here moves real money.",

  nav: [
    { label: "How it works", href: "#how" },
    { label: "Features", href: "#features" },
    { label: "Preview", href: "#preview" },
    { label: "Trust", href: "#trust" },
  ],

  cta: { primary: "Explore sample data", secondary: "See how it works" },

  hero: {
    lineA: "Know your money.",
    lineB: "Grow your future.",
    lede: "A money copilot for Romania that helps you spend less, earn more and see where you're heading.",
    aside: "A smarter way to your next chapter",
  },

  how: {
    title: "From scattered accounts to a clear path",
    lede: "Four steps, each one small enough to finish today.",
    steps: [
      { title: "See it all", text: "Income, spending, goals and net worth in one clear view." },
      { title: "Find the leaks", text: "Subscriptions you forgot and bills that crept up, each with Keep or Cancel." },
      { title: "Move it to a goal", text: "Send what you found toward something you want, in one tap." },
      { title: "Watch the path update", text: "Your forecast changes as your life does, shown as a range." },
    ],
  },

  features: {
    title: "One app for today and the decades after it",
    lede: "Five jobs, working from the same picture of your money.",
    items: [
      { icon: "eye", title: "Clear view", text: "Every account in one place, and you can correct anything." },
      { icon: "tag", title: "Save everywhere", text: "Start with the biggest recurring costs, then move to shopping and daily spending." },
      { icon: "spark", title: "Thinks ahead", text: "Spots what could happen next and always shows why it suggested something." },
      { icon: "trend", title: "Earn more", text: "Income ideas matched to your skills, time, location and appetite for risk." },
      { icon: "compass", title: "Plan the future", text: "Goals, net worth and retirement as likely ranges that refresh after every big change." },
    ],
  },

  preview: {
    title: "Meet Ana. Her €40 a month became a trip to Greece.",
    lede: "Ana is a sample profile. Everything below comes from her demo data.",
    label: "Sample data",
  },

  trust: {
    title: "Built to earn your trust before your money",
    items: [
      { icon: "lock", title: "Your bank password stays yours", text: "Bank access runs on your consent, and you can disconnect at any time." },
      { icon: "calc", title: "Code does the maths, AI explains it", text: "Every balance, ranking and forecast comes from fixed calculations." },
      { icon: "range", title: "Ranges, not promises", text: "Cautious, expected and optimistic paths, all in today's money." },
      { icon: "pause", title: "Pausing is part of the plan", text: "A car repair changes a date. It never counts as failing." },
    ],
  },

  close: {
    title: "See where you're heading",
    lede: "Explore Ana's sample data first. No sign-up and no bank connection needed.",
  },
};

/* Ana's demo numbers, copied from financial-futures-context/fixtures/ana. Formatted, never re-rounded. */
window.ANA = {
  balance: "4.216,35 lei",
  netWorth: "29.253,85 lei",
  found: "198,98 lei",
  subs: [
    { name: "FitZone", amount: 129.0, label: "129,00 lei", note: "Last used June" },
    { name: "StreamPlus", amount: 39.99, label: "39,99 lei", note: "Never opened" },
    { name: "PhotoEdit Pro", amount: 29.99, label: "29,99 lei", note: "Last used March" },
  ],
  goal: { name: "Greece trip", saved: 1200, target: 5000, monthly: "475,00 lei", finish: "11 iun. 2027" },
  pot: {
    cautious: { rate: 0.02, label: "575.300 lei", lasts: "90" },
    expected: { rate: 0.04, label: "881.300 lei", lasts: "100+" },
    optimistic: { rate: 0.06, label: "1.392.400 lei", lasts: "100+" },
  },
  october: {
    income: "6.800,00 lei",
    spending: "7.124,95 lei",
    categories: [
      { name: "Rent", amount: 2300, label: "2.300,00 lei" },
      { name: "Car repair", amount: 1450, label: "1.450,00 lei" },
      { name: "Groceries", amount: 1350, label: "1.350,00 lei" },
      { name: "Shopping", amount: 600, label: "600,00 lei" },
      { name: "Eating out", amount: 520, label: "520,00 lei" },
      { name: "Everything else", amount: 904.95, label: "904,95 lei" },
    ],
  },
  /* Year-by-year pot from the projection engine's formula: age 29 to 65, 21.400 lei start, 852,14 lei a month. */
  potAt(rate, years) {
    const start = 21400, yearly = 852.14 * 12;
    let pot = start;
    for (let y = 0; y < years; y++) pot = pot * (1 + rate) + yearly;
    return pot;
  },
};

window.ICONS = {
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  tag: '<path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8a1.5 1.5 0 0 1 0 2.1l-6.9 6.9a1.5 1.5 0 0 1-2.1 0Z"/><circle cx="8.3" cy="8.3" r="1.3"/>',
  spark: '<path d="M12 3c.8 5 3.2 7.9 8.5 9-5.3 1.1-7.7 4-8.5 9-.8-5-3.2-7.9-8.5-9 5.3-1.1 7.7-4 8.5-9Z"/>',
  trend: '<path d="M3 17.5 9.5 11l4 4L21 7.5"/><path d="M15.5 7.5H21V13"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.8 8.2-2.3 5.3-5.3 2.3 2.3-5.3Z"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 7h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16.5h.01M12 16.5h.01M15.5 16.5h.01"/>',
  range: '<path d="M3 20c5-1 12-5 18-14"/><path d="M3 20c6 0 13-2 18-7"/><path d="M3 20c6 .5 12 .5 18-1"/>',
  pause: '<rect x="6.5" y="4.5" width="4" height="15" rx="1.2"/><rect x="13.5" y="4.5" width="4" height="15" rx="1.2"/>',
  arrow: '<path d="M4 12h15"/><path d="m13 6 6 6-6 6"/>',
  arrowUp: '<path d="M7 17 17 7"/><path d="M8.5 7H17v8.5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  home: '<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19Z"/><path d="M9.5 20.5V14h5v6.5"/>',
  bars: '<path d="M5 20v-7M12 20V5M19 20v-10"/>',
  flag: '<path d="M6 21V4"/><path d="M6 4.5c4-2 7 2 12 0v9c-5 2-8-2-12 0"/>',
  send: '<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>',
  receive: '<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>',
  dots: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
  scissors: '<circle cx="6.5" cy="6.5" r="2.8"/><circle cx="6.5" cy="17.5" r="2.8"/><path d="M8.8 8.2 20 18M8.8 15.8 20 6"/>',
};

(function () {
  const get = (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
  const svg = (name) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${window.ICONS[name] || ""}</svg>`;

  function fill(root, ctx) {
    root.querySelectorAll("[data-f]").forEach((el) => (el.textContent = get(ctx, el.dataset.f) ?? ""));
    root.querySelectorAll("[data-f-icon]").forEach((el) => (el.innerHTML = svg(get(ctx, el.dataset.fIcon))));
    root.querySelectorAll("[data-f-href]").forEach((el) => el.setAttribute("href", get(ctx, el.dataset.fHref)));
  }

  function run() {
    document.querySelectorAll("[data-each]").forEach((host) => {
      const tpl = host.querySelector("template");
      (get(window.CONTENT, host.dataset.each) || []).forEach((item, i) => {
        const node = tpl.content.cloneNode(true);
        fill(node, item);
        node.querySelectorAll("[data-n]").forEach((el) => (el.textContent = i + 1));
        const first = node.firstElementChild;
        if (first) first.style.setProperty("--i", i);
        host.appendChild(node);
      });
    });
    document.querySelectorAll("[data-c]").forEach((el) => (el.textContent = get(window.CONTENT, el.dataset.c) ?? ""));
    document.querySelectorAll("[data-icon]").forEach((el) => (el.innerHTML = svg(el.dataset.icon)));
    const brand = window.CONTENT.brand;
    document.title = `${brand}: ${document.documentElement.dataset.variant || "Landing"}`;
  }

  window.svgIcon = svg;
  run();
})();
