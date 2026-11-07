/* Shared by the three subsidy pages: Ion's farm, formatting and the Rail frame.
   All page text is Romanian. Text from the monitor goes through esc() before it reaches the page. */
(function () {
  /* The persona from docs/01-product.md and docs/11-open-questions.md (P9).
     "Private individual" isn't stated there: it's an assumption, shown as one on the funding page. */
  const ION = { name: 'Ion', age: 55, county: 'Teleorman', region: 'Sud Muntenia', startBalanceBani: 3500000, summary: '15 ha, grâu și porumb', parcels: [{ cropId: 'grau', areaHa: 8, plantedMonth: '2026-10' }, { cropId: 'porumb', areaHa: 7 }] };

  /* The farm typed in onboarding.html, or Ion when nothing is saved. Lives in this browser only. */
  const FARM_KEY = 'cropcash-farm';
  const HARVEST_KEY = 'cropcash-harvests';
  const PENSION_KEY = 'cropcash-pension';
  function savedFarm() {
    try { const v = JSON.parse(localStorage.getItem(FARM_KEY)); if (v && Array.isArray(v.parcels) && v.parcels.length) return v; } catch (e) { /* no storage */ }
    return null;
  }
  const saved = savedFarm();
  function saveFarm(farm) {
    try {
      farm ? localStorage.setItem(FARM_KEY, JSON.stringify(farm)) : localStorage.removeItem(FARM_KEY);
      localStorage.removeItem(HARVEST_KEY); // A different farm starts with its own harvests.
      localStorage.removeItem(PENSION_KEY);
    } catch (e) { /* stays for this visit */ }
  }

  /* ---- Who is here ----
     Signing in is optional for now: without it, pages open as they always have, on the farm from
     onboarding or on Ion. With it, they open from the copy of /api/me, and refreshFarm() checks
     that copy in the background and reloads only if the farm really changed. */
  const E = window.CropEngine;
  const FARM_COPY = 'cropcash-me';
  const FARM_COPY_AT = 'cropcash-me-at';
  const SUBSIDIES = new URL('.', document.currentScript.src).href;
  const PAGE = location.pathname.split('/').pop();
  const signedIn = () => {
    try { return Object.keys(localStorage).some((k) => /^sb-.*-auth-token/.test(k)); } catch (e) { return false; }
  };
  function savedMe() {
    try { return JSON.parse(localStorage.getItem(FARM_COPY)); } catch (e) { return null; }
  }
  const addScript = (src) => new Promise((done, fail) => {
    const s = document.createElement('script');
    s.src = src; s.onload = done; s.onerror = fail;
    document.head.append(s);
  });
  function forgetSession() {
    Object.keys(localStorage).filter((k) => k === FARM_COPY || /^sb-.*-auth-token/.test(k)).forEach((k) => localStorage.removeItem(k));
  }
  let live = null;
  const loadLive = () => (live ??= (async () => {
    await addScript(`${SUBSIDIES}../config.js`);
    await addScript(`${SUBSIDIES}../live.js`);
    return window.Live;
  })());
  async function refreshFarm() {
    try {
      const Live = await loadLive();
      const { farmer } = await Live.api('/api/me');
      if (!farmer) {
        if (me) { localStorage.removeItem(FARM_COPY); location.reload(); }
        return;
      }
      const change = E.farmChange(savedMe(), farmer);
      localStorage.setItem(FARM_COPY, JSON.stringify(farmer));
      localStorage.setItem(FARM_COPY_AT, new Date().toISOString());
      if (change !== 'none') location.reload();
    } catch (e) {
      if (e.status === 401) { forgetSession(); location.reload(); }
    }
  }

  /* ---- The outbox ----
     A sale, an expense or a ticked task saved without internet waits here, and every page already
     counts it. It goes out on its own when the internet is back. Money moves never wait here. */
  const OUTBOX = 'cropcash-outbox', REFUSED = 'cropcash-outbox-refused';
  const readList = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } };
  const outbox = () => E.readOutbox(readList(OUTBOX));
  const writeOutbox = (items) => { localStorage.setItem(OUTBOX, JSON.stringify(items)); };
  const me = E.withOutbox(savedMe(), outbox());
  const TODAY = E.farmToday(me ?? {}, E.todayInRomania(new Date()));
  /* The farm's own crops join docs/data here, so every page can name them and plan with them (P30). */
  function savedOwnCrops() {
    if (me) return me.harvests?.ownCrops ?? [];
    try { return JSON.parse(localStorage.getItem(HARVEST_KEY))?.ownCrops ?? []; } catch (e) { return []; }
  }
  const farmData = E.withOwnCrops(E.loadData(), savedOwnCrops());
  const BASE_FARM = me ? E.farmForPages(me, farmData, TODAY) : saved ? { ...ION, region: null, ...saved } : ION;
  const isIon = !me && !saved;

  /* ---- Harvests ----
     A project is one crop in one harvest year ("Porumb 2027"). A year holds its crops and records, so
     "Toată ferma 2027" is the same data added up. The forecast always runs on the whole year and a crop
     reads its part of it, so one bank account keeps one plan. Records with no crop are shared costs and
     APIA money. Money, salary and pension stay with the farm. Saved in this browser only.
     Recolta 2027 runs from November 2026, so the APIA advance that pays for it belongs to it. */
  const BASE_YEAR = E.harvestYear(TODAY);
  /* ---- Is the internet really there? ----
     navigator.onLine says yes on a WiFi with no internet, so a failed /api/health counts too. */
  let pingFailed = false, pingTimer = null;
  const isOnline = () => navigator.onLine && !pingFailed;
  async function ping() {
    const before = isOnline();
    try {
      await loadLive();
      const res = await fetch(`${window.CROPCASH_CONFIG.apiUrl}/api/health`, { cache: 'no-store' });
      pingFailed = !res.ok;
    } catch (e) { pingFailed = true; }
    clearTimeout(pingTimer);
    if (pingFailed && navigator.onLine) pingTimer = setTimeout(ping, 30000);
    if (before !== isOnline()) netChanged();
  }

  /* ---- Writing to the server ----
     Pages reload after a change, so the saved copy has to be new first. A write the outbox can take
     waits there when there's no internet; any other one is refused and the page says so. */
  const offlineError = () => Object.assign(new Error('offline'), { code: 'offline' });
  function queue(name, input) {
    writeOutbox([...outbox(), { id: `outbox:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, input, at: new Date().toISOString() }]);
    return { queued: true };
  }
  async function send(action) {
    const Live = isOnline() ? await loadLive().catch(() => null) : null;
    let wrote = false;
    const write = async (name, input = {}) => {
      /* A record still in the queue is taken back on the phone, with or without internet. */
      if (name === 'undo_transaction' && E.isOutboxId(input.id)) { writeOutbox(outbox().filter((i) => i.id !== input.id)); return {}; }
      if (!Live) { if (E.isQueueable(name)) return queue(name, input); throw offlineError(); }
      try {
        const result = await Live.write(name, input);
        wrote = true;
        return result;
      } catch (e) {
        if (E.isQueueable(name) && (e?.code === 'network' || e?.code === 'offline')) return queue(name, input);
        throw e;
      }
    };
    const api = (...args) => { if (!Live) throw offlineError(); wrote = true; return Live.api(...args); };
    await action({ ...(Live ?? {}), write, api });
    if (!wrote) return;
    const { farmer } = await Live.api('/api/me');
    if (farmer) { localStorage.setItem(FARM_COPY, JSON.stringify(farmer)); localStorage.setItem(FARM_COPY_AT, new Date().toISOString()); }
  }
  /* Sends the queue in order. One the server turns down is kept aside, so the farmer hears about it. */
  let flushing = false;
  async function flushOutbox() {
    if (flushing || !savedMe() || !isOnline() || !outbox().length) return;
    flushing = true;
    let changed = false;
    try {
      const Live = await loadLive();
      for (const item of outbox()) {
        try {
          await Live.write(item.name, item.input);
        } catch (e) {
          if (!(e?.status >= 400 && e.status < 500)) break;
          writeOutbox(outbox().filter((i) => i.id !== item.id));
          localStorage.setItem(REFUSED, JSON.stringify([...(readList(REFUSED) ?? []), item]));
          changed = true;
          continue;
        }
        writeOutbox(outbox().filter((i) => i.id !== item.id));
        changed = true;
      }
      if (!changed) return;
      const { farmer } = await Live.api('/api/me');
      if (farmer) { localStorage.setItem(FARM_COPY, JSON.stringify(farmer)); localStorage.setItem(FARM_COPY_AT, new Date().toISOString()); }
    } catch (e) { /* tried again when the internet comes back */ } finally { flushing = false; }
    if (changed) location.reload();
  }
  const failText = (e) => (e?.code === 'offline' || e?.code === 'network' || !navigator.onLine
    ? 'Nu am putut salva, pentru că nu ai internet. Încearcă din nou când îl ai.'
    : 'Nu am putut salva. Încearcă din nou.');

  const WHOLE_FARM_PAGES = ['2-rail.html', 'bani.html', 'salariu.html', 'date-plan.html', 'oportunitati.html', 'surse.html'];
  const wholeFarm = WHOLE_FARM_PAGES.includes(PAGE);
  const harvestMonth = (year) => `${year - 1}-11`;
  const firstHarvest = () => ({ id: `r${BASE_YEAR}`, year: BASE_YEAR, status: 'open', parcels: BASE_FARM.parcels, openingBani: BASE_FARM.startBalanceBani, summary: BASE_FARM.summary, records: [] });
  /* Which project is open stays in this browser. A farm on the server keeps nothing else here. */
  function savedView() {
    try { return JSON.parse(localStorage.getItem(HARVEST_KEY)) ?? {}; } catch (e) { return {}; }
  }
  function loadHarvests() {
    if (me) return E.harvestsFromServer(me, BASE_YEAR, farmData, savedView());
    try {
      const v = JSON.parse(localStorage.getItem(HARVEST_KEY));
      /* A sample year saved by an older version has no place here any more. */
      const items = v && Array.isArray(v.items) ? v.items.filter((h) => !h.illustrative) : [];
      if (items.length) return { ...v, items, selected: items.some((h) => h.id === v.selected) ? v.selected : items[items.length - 1].id };
    } catch (e) { /* no storage */ }
    return { selected: `r${BASE_YEAR}`, crop: null, items: [firstHarvest()] };
  }
  const state = loadHarvests();
  /* What the farmer gathered, crop by crop. It belongs to the farm, not to one harvest. */
  state.gathered ??= BASE_FARM.gathered ?? [];
  /* What the farmer expects from a normal year, from Datele planului. It wins over the above (P29). */
  state.expected ??= [];
  /* Crops the farmer described, which docs/data doesn't have. */
  state.ownCrops ??= [];
  function saveHarvests() {
    const kept = me ? { selected: state.selected, crop: state.crop } : state;
    try { localStorage.setItem(HARVEST_KEY, JSON.stringify(kept)); } catch (e) { /* stays for this visit */ }
  }
  const openHarvests = () => state.items.filter((h) => h.status === 'open').sort((a, b) => a.year - b.year);
  const selected = state.items.find((h) => h.id === state.selected) ?? openHarvests()[0] ?? state.items[state.items.length - 1];
  /* Whole-farm pages follow the harvest under way by date. Closing it doesn't change the money,
     so they keep every record since it began, whichever harvest it was noted on. */
  const current = state.items.find((h) => h.year === BASE_YEAR) ?? selected;
  const cropParcel = (h, cropId) => h.parcels.find((p) => p.cropId === cropId);
  const selectedCrop = !wholeFarm && state.crop && cropParcel(selected, state.crop) ? state.crop : null;
  const scope = wholeFarm ? current : selected;
  const scopeRecords = wholeFarm ? state.items.flatMap((h) => h.records).filter((r) => r.date >= `${harvestMonth(BASE_YEAR)}-01`) : selected.status === 'open' ? selected.records : [];
  const toTransaction = (r) => ({ id: r.id, kind: r.kind, category: r.category ?? null, crop_id: r.cropId ?? null, amount_bani: r.amountBani, occurred_at: `${r.date}T12:00:00Z`, note: null, source: 'manual' });
  const FARM = { ...BASE_FARM, parcels: scope.parcels, startBalanceBani: scope.openingBani, summary: scope.summary };
  const MONTHS = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'];

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const group = (n) => String(Math.abs(Math.trunc(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const cents = (v) => { const a = Math.abs(v); return `${group(Math.floor(a / 100))},${String(a % 100).padStart(2, '0')}`; };
  /* The farmer needs "about", not cents: headline amounts are rounded to 100 lei. */
  const about = (bani) => group(Math.round(bani / 10000) * 100);
  /* Advance and balance stay exact to the leu, so they visibly add up. */
  const exact = (bani) => group(Math.round(bani / 100));
  const ha = (ari) => (ari % 100 ? `${group(Math.floor(ari / 100))},${String(ari % 100).padStart(2, '0')}` : group(ari / 100));
  const num = (v) => String(v).replace('.', ',');
  const eurShort = (n) => {
    if (n == null) return null;
    if (n >= 1e6) return `${num(Math.round(n / 1e5) / 10)} mil. €`;
    return `${group(n)} €`;
  };
  const date = (iso, withYear) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ''}`; };
  const dayNo = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
  const daysLeft = (iso) => dayNo(iso) - dayNo(TODAY);

  const zile = (n) => (n === 1 ? '1 zi' : `${n} ${n >= 20 ? 'de ' : ''}zile`);

  const icon = (n) => window.FF.icon(n);
  const chevron = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const verify = '<span class="tag v">de verificat</span>';

  /* Tasks finished. Ticked on a real farm, they follow the farmer to any device. */
  function doneTasks() {
    if (me) return new Set((me.task_completions ?? []).map((t) => t.task_id));
    try { const v = JSON.parse(localStorage.getItem('cropcash-done')); if (Array.isArray(v)) return new Set(v); } catch (e) { /* no storage */ }
    return new Set();
  }

  /* ---- The plan: every figure on the pages comes from here ---- */
  let cachedData = null;
  const baseData = () => farmData;
  /* A signed-in farm plans from the server's records, exactly as its salary is paid, on any day. */
  const paidFarm = me && !selectedCrop && scope.year === BASE_YEAR ? me : null;
  /* The farmer's own yield and price replace the averages, so every page follows them (P26). */
  const data = () => (cachedData ??= me ? E.farmData(me, baseData()) : E.farmData({ harvests: { years: [], gathered: state.gathered, expected: state.expected } }, baseData()));
  /* The figures as they'd be without the farmer's own expectation: Recolte, or the averages. */
  const dataWithout = () => E.farmData({ harvests: { years: [], gathered: state.gathered } }, baseData());
  /* Where a crop's figures come from, for the words beside them. */
  function figureSource(cropId, withOwn = true) {
    if (E.isOwnCrop(cropId)) return 'own';
    const own = state.expected.find((e) => e.cropId === cropId);
    if (withOwn && own && (own.yieldTPerHa !== null || own.priceLeiPerKg !== null)) return 'own';
    return state.gathered.some((g) => g.cropId === cropId && (g.tonnes || g.priceLeiPerKg)) ? 'gathered' : 'average';
  }
  /* The demo pension is for farms not on the server. A real farm shows only what it really pays,
     or the screen would promise less than Stripe sends (P24). */
  function ownPension() {
    try { const v = localStorage.getItem(PENSION_KEY); return v === null ? null : Number.isInteger(+v) && +v >= 0 ? +v : null; } catch (e) { return null; }
  }
  const pensionBani = () => (me ? E.activePensionMonthly(me.pension_plans) : ownPension() ?? data().params.pension_demo_lei.value * 100);
  const grainInBarn = (h, transactions) => (h.year === BASE_YEAR ? E.grainInBarn(state.gathered, transactions, data()) : []);
  const toParcel = (p) => ({ crop_id: p.cropId, area_ari: Math.round(p.areaHa * 100), is_arable: true, ...(p.plantedMonth ? { planted_month: p.plantedMonth } : {}) });
  const storedFarm = () => paidFarm ?? ({
    birth_year: +TODAY.slice(0, 4) - FARM.age,
    start_balance_bani: FARM.startBalanceBani,
    parcels: FARM.parcels.map(toParcel),
    transactions: scopeRecords.map(toTransaction),
    stored_grain: grainInBarn(scope, scopeRecords.map(toTransaction)),
    pension_plans: { monthly_bani: pensionBani(), status: 'active' },
    apia_decision: me?.apia_decision ?? null,
  });
  const planMonth = () => (paidFarm ? TODAY.slice(0, 7) : harvestMonth(scope.year));
  const farmPlan = (farm = storedFarm()) => E.buildFarmPlan(farm, data(), { month: planMonth() });
  /* The plan with figures that aren't saved yet. A farm on the server keeps its real pension. */
  function previewPlan({ openingBani, expected, pension }) {
    const farm = storedFarm();
    return E.buildFarmPlan({
      ...farm,
      start_balance_bani: openingBani,
      pension_plans: me ? farm.pension_plans : { monthly_bani: pension, status: 'active' },
      harvests: { years: [], ...farm.harvests, gathered: state.gathered, expected },
    }, baseData(), { month: planMonth() });
  }
  /* Each kind of year, repeated, for the slider on Prognoză. */
  const longForecast = () => E.longForecast(storedFarm(), data(), { month: planMonth() });

  /* ---- A plan entry, as Calendar and Acasă show it ---- */
  const CROP_ACC = { grau: 'grâul', porumb: 'porumbul' };
  const between = (w) => `Între ${date(w.start)} și ${date(w.end, w.end.slice(0, 4) !== TODAY.slice(0, 4))}`;

  function planItem(e, month) {
    const events = new Map(baseData().calendar.events.map((x) => [x.id, x]));
    const crops = new Map(baseData().crops.crops.map((c) => [c.id, c]));
    const apiaTitle = (text) => (crop ? `${text}, partea pentru ${crop.name.toLowerCase()}` : text);
    const event = e.eventId ? events.get(e.eventId) : null;
    const base = { id: e.id, kind: e.kind, month, date: e.date, window: e.window, amount: e.amount, value: e.value, direction: e.direction, estimated: e.estimated, unverified: e.unverified, event };
    if (e.kind === 'apia_advance') return { ...base, title: apiaTitle('Avansul de la APIA'), sub: between(e.window), icon: 'down', tone: '', task: false, exactDay: true };
    if (e.kind === 'apia_balance') return { ...base, title: apiaTitle('Restul de la APIA'), sub: between(e.window), icon: 'down', tone: '', task: false, exactDay: true };
    if (e.kind === 'crop_sale') return { ...base, title: `Vinzi ${CROP_ACC[e.cropId] ?? crops.get(e.cropId)?.name_ro.toLowerCase()}`, sub: 'Sumă estimată, în cursul lunii', icon: 'sack', tone: '', task: false, exactDay: false };
    if (e.kind === 'input_cost') return { ...base, title: `${crops.get(e.cropId)?.name_ro}: ${e.what}`, sub: 'Sumă estimată, în cursul lunii', icon: 'tool', tone: 'c', task: false, exactDay: false };
    const admin = e.kind === 'admin';
    const taskId = `${e.eventId}:${(e.window?.end ?? e.date).slice(0, 4)}`;
    return { ...base, id: taskId, title: event?.title_ro ?? '', sub: `${admin ? 'Din' : 'Până pe'} ${date(e.date)}${e.estimated ? ', dată estimată' : ''}`, icon: 'cal', tone: 'b', task: !admin, exactDay: true };
  }


  /* ---- One crop's part of the year ----
     APIA pays one amount per farm, so a crop's part goes by hectares, and the parts add up exactly. */
  function areaShare(bani, parcels, cropId) {
    const ari = parcels.map((p) => Math.round(p.areaHa * 100));
    const total = ari.reduce((s, a) => s + a, 0) || 1;
    const shares = ari.map((a) => Math.floor((bani * a) / total));
    shares[0] += bani - shares.reduce((s, v) => s + v, 0);
    return shares[parcels.findIndex((p) => p.cropId === cropId)] ?? 0;
  }
  const isApia = (e) => e.kind === 'apia_advance' || e.kind === 'apia_balance';
  function cropMonths(t, h, cropId) {
    const part = (b) => areaShare(b, h.parcels, cropId);
    return t.months.map((m) => {
      const entries = m.entries.filter((e) => e.cropId === cropId || isApia(e))
        .map((e) => (isApia(e) ? { ...e, value: part(e.value), amount: e.amount && { min: part(e.amount.min), probable: part(e.amount.probable), max: part(e.amount.max) } } : e));
      const add = (direction) => entries.filter((e) => e.direction === direction).reduce((s, e) => s + e.value, 0);
      /* A crop has no balance of its own, and "hard months" are about the account. */
      return { ...m, entries, in: add('in'), out: add('out'), hard: false };
    });
  }
  const cropName = (id) => baseData().crops.crops.find((c) => c.id === id)?.name_ro ?? '';
  const crop = selectedCrop && window.CropEngine ? {
    id: selectedCrop,
    name: cropName(selectedCrop),
    ari: Math.round(cropParcel(selected, selectedCrop).areaHa * 100),
    totalAri: selected.parcels.reduce((s, p) => s + Math.round(p.areaHa * 100), 0),
    share: (bani) => areaShare(bani, selected.parcels, selectedCrop),
    months: (t) => cropMonths(t, selected, selectedCrop),
  } : null;

  const PAGES = [['subventii.html', 'Subvenția ta'], ['oportunitati.html', 'Oportunități'], ['surse.html', 'Ce s-a schimbat']];
  const TABS = [['../desktop/2-rail.html', 'home', 'Acasă'], ['subventii.html', 'bank', 'Subvenții'], ['calendar.html', 'cal', 'Calendar'], ['prognoza.html', 'chart', 'Prognoză'], ['recolte.html', 'sprout', 'Recolte'], ['salariu.html', 'sack', 'Salariu'], ['pensie.html', 'hourglass', 'Bătrânețe', 'rail-only']];

  /* ---- Funding calls, shared by Oportunități and Calendar ---- */
  const callCode = (c) => (c.title.match(/^DR-\d+/) || [null])[0];
  const VARIANT = /\s*(?:[-–]\s*(?:MDR|LDR|Adulți|Tineri)|,\s*pentru regiunile mai dezvoltate)\s*$/;
  const sectorOf = (t) => (/LEGUMICULTUR/.test(t) ? 'legume' : /ZOOTEHNIC/.test(t) ? 'animale' : 'alte sectoare');
  /* Short names. The official title stays in the call's detail. */
  function callName(c) {
    const t = c.title, id = callCode(c);
    if (id === 'DR-14') return `DR-14: Ferme mici, ${sectorOf(t)}`;
    if (id === 'DR-12') return `DR-12: Tineri fermieri, ${sectorOf(t)}`;
    if (id === 'DR-18') return 'DR-18: Flori și plante medicinale';
    if (/^STEP-AGRI/.test(t)) return 'STEP-AGRI: Competențe digitale în agricultură';
    const plain = t.replace(VARIANT, '').replace(/,?\s+în cadrul Acțiunii.*$/, '').replace(/[”“"]/g, '').trim();
    const letters = plain.replace(/[^\p{L}]/gu, '');
    const caps = letters.replace(/[^\p{Lu}]/gu, '').length;
    if (caps / letters.length < 0.7) return plain;
    const low = plain.toLocaleLowerCase('ro');
    return low[0].toLocaleUpperCase('ro') + low.slice(1);
  }

  /* ---- Funding calls and official sources ----
     Signed in, they come from the monitor through the F6 reads, and a copy stays on the phone so the
     pages open offline with that copy's date. Signed out, the snapshot files stand in. */
  const MONITOR_COPY = 'cropcash-monitor';
  const MONITOR_FRESH_MS = 60 * 60 * 1000;
  const MONITOR_PAGES = ['2-rail.html', 'oportunitati.html', 'surse.html'];
  function savedMonitor() {
    try { const v = JSON.parse(localStorage.getItem(MONITOR_COPY)); return v && Array.isArray(v.calls) ? v : null; } catch (e) { return null; }
  }
  const monitorCopy = me ? savedMonitor() : null;
  const shownMonitor = (m) => JSON.stringify(m && [m.calls, m.events, m.sources, m.changes]);
  const monitor = {
    fromServer: !!monitorCopy,
    at: () => monitorCopy?.at ?? window.SNAPSHOT_DATE ?? null,
    calls: () => monitorCopy?.calls ?? window.CALLS ?? [],
    events: () => monitorCopy?.events ?? window.CALL_EVENTS ?? [],
    sources: () => monitorCopy?.sources ?? window.SOURCES ?? [],
    problems: () => (monitorCopy ? E.problemsOf(monitorCopy.sources) : window.SOURCE_PROBLEMS ?? []),
    /* The snapshot has no real change yet, so signed out there are none to show. */
    changes: () => monitorCopy?.changes ?? [],
  };
  async function refreshMonitor() {
    const page = location.pathname.split('/').pop();
    if (!me || !navigator.onLine || !MONITOR_PAGES.includes(page)) return;
    if (monitorCopy && Date.now() - Date.parse(monitorCopy.savedAt) < MONITOR_FRESH_MS) return;
    const Live = await loadLive();
    /* Each part on its own: one table missing on the server keeps the rest. */
    const part = (name, shape, before) => Live.read(name, {}).then((r) => shape(r.data ?? []), () => before);
    const [calls, events, sources, changes] = await Promise.all([
      part('search_opportunities', E.callsFromServer, monitorCopy?.calls ?? null),
      part('list_opportunity_changes', E.eventsFromServer, monitorCopy?.events ?? []),
      part('list_sources', E.sourcesFromServer, monitorCopy?.sources ?? null),
      part('list_recent_changes', (rows) => rows, monitorCopy?.changes ?? []),
    ]);
    if (!calls) return;
    const copy = { savedAt: new Date().toISOString(), at: E.todayInRomania(new Date()), calls, events, sources: sources ?? window.SOURCES ?? [], changes };
    try { localStorage.setItem(MONITOR_COPY, JSON.stringify(copy)); } catch (e) { return; }
    if (shownMonitor(copy) !== shownMonitor(monitorCopy)) location.reload();
  }

  /* Following. Signed in it's saved on the farm, so the calendar and other phones see it.
     Signed out it stays in this browser. A follow needs internet and is never queued. */
  const FOLLOWS = 'cropcash-follows';
  function loadFollows() {
    const now = savedMe();
    if (now) return new Set((now.opportunity_follows ?? []).map((f) => f.stable_key));
    try { const v = JSON.parse(localStorage.getItem(FOLLOWS)); if (Array.isArray(v)) return new Set(v); } catch (e) { /* no storage */ }
    return new Set();
  }
  function saveFollows(set) {
    try { localStorage.setItem(FOLLOWS, JSON.stringify([...set])); } catch (e) { /* stays for this visit */ }
  }
  async function setFollow(keys, on) {
    if (!me) {
      const set = loadFollows();
      keys.forEach((k) => (on ? set.add(k) : set.delete(k)));
      return saveFollows(set);
    }
    await send(async (Live) => {
      for (const key of keys) await Live.write(on ? 'follow_opportunity' : 'unfollow_opportunity', { key });
    });
  }
  const unfollow = (keys) => setFollow(keys, false);
  /* The calls in the calendar. Signed in, the farm keeps each one's title and deadline, so a call
     that left the list still shows. */
  function followedCalls() {
    const now = savedMe();
    if (!now) { const follows = loadFollows(); return monitor.calls().filter((c) => follows.has(c.key)); }
    const byKey = new Map(monitor.calls().map((c) => [c.key, c]));
    return (now.opportunity_follows ?? []).map((f) => {
      const c = byKey.get(f.stable_key);
      return { ...c, key: f.stable_key, title: f.opportunities?.title ?? c?.title, deadline: f.opportunities?.deadline ?? c?.deadline ?? null, url: f.opportunities?.url ?? c?.url };
    }).filter((c) => c.title);
  }

  /* Puts the Rail frame around the page's <main>. */
  function frame() {
    const main = document.querySelector('main');
    const here = location.pathname.split('/').pop() || PAGES[0][0];
    const section = PAGES.some(([href]) => href === here) ? 'subventii.html' : ['date-plan.html', 'bani.html'].includes(here) ? 'salariu.html' : here;
    const onSection = (href) => href.split('/').pop() === section;
    const logo = `<span class="logo"><span class="mark">${icon('sprout')}</span><span>CropCash</span></span>`;
    const app = document.createElement('div');
    app.className = 'app';
    app.innerHTML = `<header class="m-top field">${logo}${harvestChip()}</header><div class="shell"><aside class="rail field">${logo}
      <nav aria-label="Principal">${TABS.map(([href, ic, label, only]) => `<a href="${href}"${only ? ` class="${only}"` : ''}${onSection(href) ? ' aria-current="page"' : ''}>${icon(ic)}${label}</a>`).join('')}</nav>
      ${harvestChip()}<div class="farm glass"><b>${esc(FARM.name)}, ${esc(FARM.county)}</b>${esc(FARM.summary)}<br>Date din ${date(TODAY, true)}<br><a href="onboarding.html">Schimbă ferma</a></div></aside><div class="main-slot"></div></div>`;
    main.before(app);
    harvestSheet(app);
    app.querySelector('.main-slot').replaceWith(main);
    const subnav = main.querySelector('.subnav');
    if (subnav) subnav.innerHTML = PAGES.map(([href, label]) => `<a href="${href}"${href === here ? ' aria-current="page"' : ''}>${label}</a>`).join('');
    /* Phones hide the rail, so this sits at the end of the page. */
    if (signedIn()) main.insertAdjacentHTML('beforeend', `<p class="sign-out">${me ? '<a href="bani.html">Contul tău</a>' : ''}<a href="login.html?signout=1">Ieși din cont</a></p>`);
  }

  /* ---- Switching between harvests ---- */
  const harvestName = (h) => `Recolta ${h.year}`;
  const statusWord = (h) => (h.status === 'open' ? 'în lucru' : 'încheiată');
  const projectName = (h, cropId) => (cropId ? `${cropName(cropId)} ${h.year}` : `Toată ferma ${h.year}`);
  const projectClosed = (h, cropId) => (cropId ? (cropParcel(h, cropId)?.status ?? h.status) : h.status) === 'closed';
  /* Harvests fall in the year named on the project, so the usual month is enough here. */
  const seasonWord = (cropId) => `se strânge în ${MONTHS[(baseData().crops.crops.find((c) => c.id === cropId)?.harvest_month ?? 1) - 1]}`;
  function harvestChip() {
    if (wholeFarm) return '<span class="h-chip whole">Toată ferma</span>';
    return `<button type="button" class="h-chip" data-harvest-open aria-haspopup="dialog">${esc(projectName(selected, selectedCrop))}${chevron}</button>`;
  }
  function selectHarvest(id, cropId = null) {
    state.selected = id;
    state.crop = cropId;
    saveHarvests();
    location.reload();
  }
  /* The year under way is the real farm, so a change there reaches its parcels and balance too. */
  const sendHarvests = () => send(async (Live) => {
    saveHarvests();
    const change = E.farmEdit(me, current, farmData);
    await Live.write('save_harvests', E.harvestsDocument(state));
    if (change) await Live.write('update_farm', change);
  });
  /* Saves what Datele planului changed. Every figure lands where Recolte and onboarding read it. */
  async function savePlanFigures({ openingBani, expected, pension }) {
    current.openingBani = openingBani;
    state.expected = expected;
    if (me) return sendHarvests();
    try { localStorage.setItem(PENSION_KEY, String(pension)); } catch (e) { /* stays for this visit */ }
    saveHarvests();
  }
  function addCrop(id) {
    state.selected = id;
    state.crop = null;
    saveHarvests();
    location.href = 'recolte.html#cultura';
    if (PAGE === 'recolte.html') location.reload();
  }
  function harvestSheet(app) {
    if (wholeFarm) return;
    const sheet = document.createElement('dialog');
    sheet.className = 'h-sheet';
    sheet.setAttribute('aria-label', 'Alege recolta');
    const rowFor = (h, cropId, name, sub) => `<button type="button" data-harvest="${esc(h.id)}" data-crop="${esc(cropId ?? '')}"${h.id === selected.id && cropId === selectedCrop ? ' aria-current="true"' : ''}><b>${esc(name)}</b><span>${esc(sub)}</span></button>`;
    const rows = [...state.items].sort((a, b) => b.year - a.year).map((h) => `<section class="h-group"><h3>${h.year}</h3>
      ${rowFor(h, null, 'Toată ferma', statusWord(h))}
      ${h.parcels.map((p) => rowFor(h, p.cropId, cropName(p.cropId), projectClosed(h, p.cropId) ? 'încheiată' : `${String(p.areaHa).replace('.', ',')} ha, ${seasonWord(p.cropId)}`)).join('')}
      ${h.status === 'open' ? `<button type="button" class="h-add" data-add-crop="${esc(h.id)}">Adaugă o cultură</button>` : ''}</section>`).join('');
    sheet.innerHTML = `<h2>Alege recolta</h2><div class="h-rows">${rows}</div><a class="btn btn-line" href="recolte.html#nou">Începe anul următor</a>`;
    app.after(sheet);
    app.addEventListener('click', (e) => { if (e.target.closest('[data-harvest-open]')) sheet.showModal(); });
    sheet.addEventListener('click', (e) => {
      const row = e.target.closest('[data-harvest]'), add = e.target.closest('[data-add-crop]');
      if (row) selectHarvest(row.dataset.harvest, row.dataset.crop || null);
      else if (add) addCrop(add.dataset.addCrop);
      else if (e.target === sheet) sheet.close();
    });
  }

  /* ---- Planned against real ---- */
  function harvestPlan(h, records) {
    const transactions = records.map(toTransaction);
    const farm = { ...storedFarm(), start_balance_bani: h.openingBani, transactions, parcels: h.parcels.map(toParcel), stored_grain: grainInBarn(h, transactions) };
    return E.buildFarmPlan(farm, data(), { month: harvestMonth(h.year) });
  }
  /* What should be left when a harvest ends: its records count, and so do salary and pension. */
  function harvestEnd(h) {
    const plan = harvestPlan(h, h.records), months = plan.timelines.medium.months;
    return Math.max(0, months[months.length - 1].balanceEnd - months.length * (plan.salary.salary + pensionBani()));
  }
  function harvestPlanned(h, cropId = null) {
    const saved = cropId ? cropParcel(h, cropId)?.planned : h.planned;
    if (saved) return saved;
    const t = harvestPlan(h, []).timelines.medium;
    if (cropId) {
      const months = cropMonths(t, h, cropId);
      return { inBani: months.reduce((s, m) => s + m.in, 0), outBani: months.reduce((s, m) => s + m.out, 0) };
    }
    return { inBani: t.months.reduce((s, m) => s + m.in, 0), outBani: t.months.reduce((s, m) => s + m.out, 0), endBani: t.months[t.months.length - 1].balanceEnd };
  }
  const moneyIn = (rows) => rows.filter((r) => r.amountBani > 0).reduce((s, r) => s + r.amountBani, 0);
  const moneyOut = (rows) => -rows.filter((r) => r.amountBani < 0).reduce((s, r) => s + r.amountBani, 0);
  /* Costs shared across crops only reach a crop in its closed result, split by hectares. */
  function harvestActual(h, cropId = null) {
    if (!cropId) return { inBani: moneyIn(h.records), outBani: moneyOut(h.records) };
    const own = h.records.filter((r) => r.cropId === cropId), shared = h.records.filter((r) => !r.cropId);
    const part = (b) => areaShare(b, h.parcels, cropId);
    return { inBani: moneyIn(own) + part(moneyIn(shared)), outBani: moneyOut(own) + (projectClosed(h, cropId) ? part(moneyOut(shared)) : 0) };
  }
  function closeProject(h, cropId = null) {
    for (const p of h.parcels) {
      if ((cropId && p.cropId !== cropId) || projectClosed(h, p.cropId)) continue;
      p.planned = harvestPlanned(h, p.cropId);
      p.status = 'closed';
    }
    if (h.parcels.every((p) => p.status === 'closed')) { h.planned = harvestPlanned(h); h.status = 'closed'; }
  }
  function reopenProject(h, cropId = null) {
    for (const p of h.parcels) {
      p.status ??= h.status;
      if (cropId && p.cropId !== cropId) continue;
      p.status = 'open';
      delete p.planned;
    }
    h.status = 'open';
    delete h.planned;
  }
  const signedLei = (bani) => `${bani < 0 ? '−' : ''}${exact(Math.abs(bani))} lei`;
  function compareTable(h, realLabel, cropId = null) {
    const p = harvestPlanned(h, cropId), a = harvestActual(h, cropId);
    const ari = (cropId ? h.parcels.filter((x) => x.cropId === cropId) : h.parcels).reduce((s, x) => s + Math.round(x.areaHa * 100), 0);
    const perHa = (bani) => Math.round((bani * 100) / (ari || 1));
    /* Mid-year the gap only says the year isn't over, so it shows once the harvest is closed. */
    const closed = projectClosed(h, cropId);
    const split = !cropId ? '' : `<p class="note gap">${closed ? 'Subvenția și cheltuielile comune sunt împărțite după hectare.' : 'Subvenția e împărțită după hectare. Cheltuielile comune stau la Toată ferma.'}</p>`;
    const row = (label, planned, real) => `<tr><th scope="row">${label}</th><td data-l="Plan">${signedLei(planned)}</td><td data-l="${realLabel}">${signedLei(real)}</td>${closed ? `<td data-l="Diferență">${signedLei(real - planned)}</td>` : ''}</tr>`;
    return `<table class="crop-table"><thead><tr><th scope="col"></th><th scope="col">Plan</th><th scope="col">${realLabel}</th>${closed ? '<th scope="col">Diferență</th>' : ''}</tr></thead><tbody>
      ${row('Intrat', p.inBani, a.inBani)}${row('Ieșit', p.outBani, a.outBani)}${row('Rămas', p.inBani - p.outBani, a.inBani - a.outBani)}${row('Rămas pe hectar', perHa(p.inBani - p.outBani), perHa(a.inBani - a.outBani))}</tbody></table>${split}`;
  }

  /* A finished harvest shows what happened: the engine can't rebuild a year before its calendar. */
  function closedView() {
    if (wholeFarm || !projectClosed(selected, selectedCrop)) return false;
    const main = document.querySelector('main');
    const next = openHarvests()[0];
    const whole = selectedCrop && selected.status === 'open';
    main.innerHTML = `<div><header class="page-h"><div><h1>${esc(projectName(selected, selectedCrop))}</h1><p class="lead">Recolta e încheiată. Aici vezi planul și ce s-a întâmplat.</p></div></header>
      <section class="card"><div class="card-h"><h2>Plan și realitate</h2></div>${compareTable(selected, 'Real', selectedCrop)}</section>
      <div class="ob-actions"><a class="btn btn-dark" href="recolte.html">Vezi recolta</a>${whole ? `<button type="button" class="btn btn-line" data-harvest="${esc(selected.id)}">Mergi la ${esc(projectName(selected))}</button>` : next ? `<button type="button" class="btn btn-line" data-harvest="${esc(next.id)}">Mergi la ${esc(projectName(next))}</button>` : ''}</div></div>`;
    main.addEventListener('click', (e) => { const b = e.target.closest('[data-harvest]'); if (b) selectHarvest(b.dataset.harvest); });
    return true;
  }
  /* Only the 2026 rates and dates exist, so a later harvest is an estimate. */
  function futureNote() {
    if (wholeFarm || selected.status !== 'open' || selected.year <= BASE_YEAR) return;
    document.querySelector('main .page-h')?.insertAdjacentHTML('afterend', `<p class="offline">${esc(projectName(selected, selectedCrop))} e o estimare: folosim sumele și datele din 2026. ${verify}</p>`);
  }

  /* A palette saved before the picker left Acasă still applies. */
  function applyPalette() {
    let saved = null;
    try { saved = localStorage.getItem('farm-palette:2-rail'); } catch (e) { /* private window */ }
    if (saved) window.FF.palette(saved, false);
  }

  /* ---- The currency amounts are shown in ----
     Display only, as in apps/web, and the same two saved keys. Without rates it stays in lei, so no
     rate is ever guessed. It works on the printed text so every page and chart follows it, and form
     fields keep their lei, because a field's value isn't text on the page. */
  const CURRENCY_KEY = 'cropcash-currency', RATES_KEY = 'cropcash-rates';
  function savedRates() {
    try { return E.ExchangeRatesSchema.parse(JSON.parse(localStorage.getItem(RATES_KEY))); } catch (e) { return null; }
  }
  const currency = {
    all: () => E.CURRENCIES,
    rates: savedRates,
    code() {
      try { const v = localStorage.getItem(CURRENCY_KEY); return E.CURRENCIES.includes(v) && savedRates() ? v : 'RON'; } catch (e) { return 'RON'; }
    },
    set(code) { try { localStorage.setItem(CURRENCY_KEY, code); } catch (e) { /* stays in lei */ } location.reload(); },
    saveRates(rates) { try { localStorage.setItem(RATES_KEY, JSON.stringify(rates)); } catch (e) { /* asked for again next time */ } },
  };
  function showCurrency() {
    if (!E) return;
    const code = currency.code(), rates = savedRates();
    if (code === 'RON') return;
    const fix = (node) => {
      /* data-keep-lei marks text that describes what to type in a field, and fields are always in lei. */
      if (node.parentElement?.closest('script, style, [data-keep-lei]')) return;
      const text = E.convertText(node.nodeValue, code, rates);
      if (text !== node.nodeValue) node.nodeValue = text;
    };
    const walk = (root) => {
      if (root.nodeType === Node.TEXT_NODE) return fix(root);
      const nodes = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (nodes.nextNode()) fix(nodes.currentNode);
    };
    new MutationObserver((changes) => changes.forEach((c) => (c.type === 'characterData' ? fix(c.target) : c.addedNodes.forEach(walk))))
      .observe(document.documentElement, { subtree: true, childList: true, characterData: true });
    walk(document.documentElement);
  }

  /* ---- Without internet ----
     Each page says what it does without internet. A button that needs it carries
     data-needs-net="the reason", and all of them turn off and say why in the same way. */
  const STALE_DAYS = 7; // docs/07-architecture.md §8: after a week the figures may be out of date.
  function netBanner() {
    const main = document.querySelector('main > div, main');
    if (!main) return;
    let box = document.getElementById('net-banner');
    if (!box) { main.insertAdjacentHTML('afterbegin', '<div id="net-banner" role="status"></div>'); box = document.getElementById('net-banner'); }
    const notes = [];
    let at = null;
    try { at = localStorage.getItem(FARM_COPY_AT); } catch (e) { /* no storage */ }
    const days = at ? Math.floor((Date.now() - Date.parse(at)) / 864e5) : 0;
    if (me && !isOnline()) notes.push([days >= STALE_DAYS ? 'warn' : '', `Fără internet. Datele sunt din ${at ? date(String(at).slice(0, 10), true) : 'ultima conectare'}.${days >= STALE_DAYS ? ' Au mai mult de o săptămână, așa că cifrele pot fi depășite.' : ''}`]);
    const waiting = E.pendingRecords(outbox());
    if (me && waiting) notes.push(['', `${waiting === 1 ? 'O înregistrare se trimite' : `${waiting} înregistrări se trimit`} când ai internet. Cifrele o includ deja, așa că salariul e provizoriu până atunci.`]);
    const refused = readList(REFUSED) ?? [];
    if (me && refused.length) notes.push(['warn', `${refused.length === 1 ? 'O înregistrare n-a fost primită de server, așa că nu apare în cifre. Noteaz-o din nou în Recolte.' : `${refused.length} înregistrări n-au fost primite de server, așa că nu apar în cifre. Notează-le din nou în Recolte.`} <button type="button" class="h-quiet" data-refused-ok>Am înțeles</button>`]);
    box.innerHTML = notes.map(([tone, text]) => `<p class="offline net-note${tone ? ` ${tone}` : ''}">${text}</p>`).join('');
  }
  function needsNet(root = document) {
    const off = !isOnline();
    root.querySelectorAll?.('[data-needs-net]').forEach((b) => {
      /* Only undoes what it did: a button a page turned off for its own reason stays off. */
      if (off && !b.disabled) { b.disabled = true; b.dataset.netOff = '1'; }
      if (!off && b.dataset.netOff) { b.disabled = false; delete b.dataset.netOff; }
      const why = b.nextElementSibling?.classList.contains('net-why') ? b.nextElementSibling : null;
      if (off && !why) b.insertAdjacentHTML('afterend', `<small class="net-why">${esc(b.dataset.needsNet || 'Pornește internetul.')}</small>`);
      if (!off && why) why.remove();
    });
  }
  function netChanged() {
    document.querySelectorAll('[data-offline]').forEach((note) => { note.hidden = isOnline(); });
    needsNet();
    netBanner();
    if (isOnline()) flushOutbox();
  }
  function offlineNote() {
    addEventListener('online', () => { pingFailed = false; netChanged(); ping(); });
    addEventListener('offline', netChanged);
    document.addEventListener('click', (e) => {
      if (!e.target.closest('[data-refused-ok]')) return;
      localStorage.removeItem(REFUSED);
      netBanner();
    });
    new MutationObserver((changes) => changes.forEach((c) => c.addedNodes.forEach((n) => {
      if (n.nodeType !== 1) return;
      if (n.matches('[data-needs-net]') || n.querySelector('[data-needs-net]')) needsNet(n.parentElement ?? n);
    }))).observe(document.body, { childList: true, subtree: true });
    netChanged();
  }

  /* ---- The app opens without internet ----
     The service worker keeps every page, script and font on the phone (farm-app/sw.js). */
  function installOffline() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(`${SUBSIDIES}../sw.js`, { scope: `${SUBSIDIES}../` }).catch(() => { /* opens online only */ });
    navigator.storage?.persist?.().catch(() => { /* the browser decides */ });
  }

  window.CC = {
    baseData, longForecast, ION, FARM, isIon, onServer: !!me, BASE_YEAR, crop, harvests: { state, selected, scope, cropName, closed: projectClosed, projectName, seasonWord, addCrop, close: closeProject, reopen: reopenProject, open: openHarvests, save: me ? sendHarvests : saveHarvests, send, failText, select: selectHarvest, name: harvestName, status: statusWord, month: harvestMonth, planned: harvestPlanned, end: harvestEnd, actual: harvestActual, compare: compareTable }, closedView, saveFarm, data, dataWithout, figureSource, farmPlan, storedFarm, previewPlan, savePlanFigures, pensionBani, ownPension, applyPalette, TODAY, esc, group, cents, about, exact, ha, num, eurShort, date, daysLeft, zile, icon, chevron, verify,
    planItem, VARIANT, callCode, callName, loadFollows, setFollow, unfollow, followedCalls, monitor, doneTasks, send, failText, me, isSignedIn: signedIn, live: loadLive, isOnline,
    currency,
    start() { applyPalette(); frame(); offlineNote(); futureNote(); showCurrency(); },
  };
  installOffline();
  if (signedIn()) addEventListener('load', () => { ping().then(flushOutbox); refreshFarm(); refreshMonitor().catch(() => { /* the saved copy stays */ }); });
})();
