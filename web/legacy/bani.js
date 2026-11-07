/* Ported from farm-app by web/scripts/port-legacy.mjs. Edit farm-app, or edit here and stop re-running the port. */
/* eslint-disable */
// @ts-nocheck
export default function install() {
/* "Contul tău": Stripe setup, the split with "Bine așa", salaries paid, the pension, the currency and the demo.
   What's on screen comes from the saved farm, so it opens offline. Anything that moves money needs
   internet and is never queued: without it the button says so and nothing changes. */
(function () {
  const { esc, exact, about, date, verify } = CC;
  CC.start();

  const el = (id) => document.getElementById(id);
  const cards = el('cards');
  if (!CC.onServer) {
    cards.innerHTML = `<section class="card s12"><h2>Încă nu ai cont</h2><p class="note">Banii se pot muta doar dintr-un cont. <a href="${CC.isSignedIn() ? '/onboarding">Spune-ne despre fermă' : '/login">Intră în cont'}</a>.</p></section>`;
    return;
  }

  const E = CropEngine;
  const me = CC.me;
  const data = CC.data();
  const plan = CC.farmPlan();
  const lei = (bani) => `${bani < 0 ? '−' : ''}${exact(Math.abs(bani))} lei`;
  const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  const monthName = (key) => `${MONTHS[+key.split('-')[1] - 1]} ${key.slice(0, 4)}`;
  const hasAccount = !!me.stripe_account_id;
  const ARRIVED = 'cropcash-arrived', EVENTS = 'cropcash-events';
  const taken = (key) => { try { const v = JSON.parse(sessionStorage.getItem(key)); sessionStorage.removeItem(key); return v; } catch (e) { return null; } };
  const keep = (key, value) => { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* lost on reload */ } };

  /* ---- Moving money ---- */
  const problem = (e) => {
    if (e?.code === 'offline' || e?.code === 'network') return 'Pornește internetul ca să muți banii.';
    if (e?.code === 'too_much') return 'Suma din plicuri e mai mare decât banii pe care îi ai.';
    return 'Nu a mers. Încearcă din nou.';
  };
  let busy = false;
  async function run(button, slot, action) {
    if (busy) return;
    busy = true;
    const text = button.textContent;
    button.disabled = true;
    button.textContent = 'Așteaptă puțin…';
    slot.hidden = true;
    try {
      await CC.send(action);
      location.reload();
    } catch (e) {
      busy = false;
      button.disabled = false;
      button.textContent = text;
      slot.textContent = problem(e);
      slot.hidden = false;
    }
  }
  const errorSlot = (id) => `<p class="ob-err" id="${id}" role="alert" hidden></p>`;

  /* ---- Setting up the account ---- */
  const setupCard = () => `<section class="card s12"><div class="card-h"><h2>Contul CropCash</h2></div>
    <p class="note">Banii de la APIA ajung într-un cont CropCash, din care îți plătim salariul lunar.</p>
    ${errorSlot('setup-err')}<button type="button" class="btn btn-dark gap" data-act="setup" data-needs-net="Pornește internetul ca să muți banii.">Activează contul (test)</button></section>`;

  /* ---- Envelopes ---- */
  const KINDS = [['salary', 'Salariu'], ['spring_inputs', 'Cheltuieli fermă'], ['debts', 'Datorii'], ['pension', 'Bătrânețe']];
  function bars(env) {
    const max = Math.max(...KINDS.map(([k]) => env[k]), 1);
    return KINDS.map(([k, name]) => `<li class="ac-env"><span class="ac-env-l"><b>${name}</b><span>${lei(env[k])}</span></span><span class="ac-env-bar"><i style="transform:scaleX(${(env[k] / max).toFixed(3)})"></i></span></li>`).join('');
  }
  function envelopesCard() {
    const filled = KINDS.some(([k]) => plan.envelopes[k] > 0);
    return `<section class="card s7"><div class="card-h"><h2>Plicurile tale</h2></div>
      ${filled ? `<ol class="ac-envs">${bars(plan.envelopes)}</ol>` : '<p class="note">Încă n-ai împărțit banii pe plicuri.</p>'}
      ${plan.startBalance > 0 ? '<button type="button" class="btn btn-dark gap" data-act="split">Împarte banii pe plicuri</button>' : '<p class="note">Ca să împărți banii, spune-ne întâi câți bani ai.</p>'}</section>`;
  }
  function openSplit(amount) {
    el('s-title').textContent = amount ? 'Au intrat bani!' : `Împarte ${lei(plan.startBalance)}`;
    el('s-lead').textContent = amount ? `Au intrat ${lei(amount)} de la APIA. Îți propunem așa:` : 'Îți propunem așa. Banii rămân la tine, iar plicurile te ajută să știi pentru ce sunt.';
    el('s-bars').innerHTML = bars(plan.proposal);
    el('s-why').textContent = `Salariul și pensia acoperă ${plan.monthsCovered === 1 ? 'o lună' : `${plan.monthsCovered} luni`}, până la următoarele încasări.`;
    el('split').showModal();
  }

  /* ---- Salaries paid ---- */
  const PAID = { scheduled: 'programat', pending: 'pe drum', paid: 'plătit', failed: 'neplătit' };
  function payoutsCard() {
    const rows = [...(me.payouts ?? [])].sort((a, b) => b.scheduled_for.localeCompare(a.scheduled_for));
    const pensions = (me.transactions ?? []).filter((t) => t.kind === 'pension');
    return `<section class="card s5"><div class="card-h"><h2>Salarii</h2></div>
      ${rows.length ? `<ol class="ac-list">${rows.map((p) => `<li><span><b>${esc(monthName(p.scheduled_for.slice(0, 7)))}</b><small>${PAID[p.status] ?? ''}</small></span><span class="ac-amt">${lei(p.amount_bani)}</span></li>`).join('')}</ol>` : '<p class="note">Niciun salariu plătit încă.</p>'}
      ${pensions.length ? `<p class="note gap">Bătrânețe: ${pensions.length === 1 ? 'o plată făcută' : `${pensions.length} plăți făcute`}.</p>` : ''}</section>`;
  }

  /* ---- Pension: a summary. Starting, changing and stopping it happen on /pensie ---- */
  const pensionMonthly = plan.smoothing.pensionMonthly;
  const saved = -(me.transactions ?? []).filter((t) => t.kind === 'pension').reduce((sum, t) => sum + t.amount_bani, 0);
  function pensionCard() {
    const body = pensionMonthly > 0
      ? `<p class="n20">Pui ${lei(pensionMonthly)} pe lună.</p><p class="note">Până acum: ${lei(saved)}</p>`
      : '<p class="note">Nu pui încă bani deoparte pentru bătrânețe.</p>';
    return `<section class="card s7"><div class="card-h"><h2>Bătrânețe</h2><span><a href="/pensie">${pensionMonthly > 0 ? 'Schimbă' : 'Vezi cât strângi'}</a></span></div>${body}</section>`;
  }

  /* ---- Currency: needs internet once, then the rates stay on the phone ---- */
  const NAMES = { RON: 'lei', EUR: 'euro', USD: 'dolari', GBP: 'lire' };
  function currencyCard() {
    const on = CC.currency.code();
    return `<section class="card s5"><div class="card-h"><h2>Moneda</h2></div>
      ${CC.currency.rates() ? `<div class="chips">${CC.currency.all().map((c) => `<button type="button" class="chip" data-currency="${c}" aria-pressed="${c === on}">${NAMES[c]}</button>`).join('')}</div>`
        : '<p class="note">Pornește internetul o dată ca să poți schimba moneda.</p>'}
      ${on === 'RON' ? '' : `<p class="note gap">Sume orientative în ${NAMES[on]}. Câmpurile și prețurile pe kilogram rămân în lei.</p>`}</section>`;
  }

  /* ---- Demo: only with VITE_DEMO_MODE=true ---- */
  const EVENT_KIND = { apia_advance: 'avansul APIA', apia_balance: 'restul de la APIA', crop_sale: 'vânzarea recoltei', credit: 'creditul pe adeverința APIA' };
  function eventText(e) {
    const amount = lei(e.amount);
    if (e.type === 'salary') return e.ok ? `Salariu plătit: ${amount}` : `Salariul de ${amount} n-a putut fi plătit: nu sunt destui bani în contul CropCash.`;
    if (e.type === 'income') return `Au intrat ${amount}: ${EVENT_KIND[e.kind] ?? ''}`;
    if (e.type === 'expense') return `Cheltuială fermă: ${amount} (${CC.harvests.cropName(e.kind)})`;
    if (e.type === 'pension') return `Pus deoparte pentru bătrânețe: ${amount}`;
    return `Rată la credit plătită din bancă: ${amount}`;
  }
  const advanceIn = (me.transactions ?? []).some((t) => t.kind === 'apia_advance');
  const events = taken(EVENTS) ?? [];
  function demoCard() {
    if (!window.CROPCASH_CONFIG?.demo || !hasAccount) return '';
    return `<section class="card s12"><div class="card-h"><h2>Demo</h2><span>Azi, în demo: ${date(CC.TODAY, true)}</span></div>
      <div class="ob-actions"><button type="button" class="btn btn-dark" data-act="income" data-needs-net="Pornește internetul ca să muți banii."${advanceIn ? ' disabled' : ''}>${advanceIn ? 'Avansul APIA a intrat' : 'Simulează avansul APIA'}</button>
      ${[1, 3, 6].map((n) => `<button type="button" class="btn btn-line" data-forward="${n}" data-needs-net="Pornește internetul ca să muți banii.">Dăm timpul înainte: ${n === 1 ? 'o lună' : `${n} luni`}</button>`).join('')}</div>
      ${errorSlot('d-err')}
      ${events.length ? `<h3 class="gap">Ce s-a întâmplat</h3><ol class="ac-list">${events.map((e) => `<li><span><small>${esc(eventText(e))}</small></span><span class="ac-amt">${esc(date(e.date))}</span></li>`).join('')}</ol>` : ''}</section>`;
  }

  cards.innerHTML = [hasAccount ? '' : setupCard(), envelopesCard(), payoutsCard(), pensionCard(), currencyCard(), demoCard()].join('');
  const arrived = taken(ARRIVED);
  if (arrived) openSplit(arrived);

  /* ---- Rates for next time, offline ---- */
  CC.live().then((Live) => Live.api('/api/exchange-rates')).then(({ rates }) => {
    if (!rates) return;
    const first = !CC.currency.rates();
    CC.currency.saveRates(rates);
    if (first) cards.querySelector('[data-currency]') ?? location.reload();
  }).catch(() => { /* keeps the saved rates */ });


  document.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-currency]');
    if (chip) return CC.currency.set(chip.dataset.currency);
    const forward = e.target.closest('[data-forward]');
    if (forward) {
      return run(forward, el('d-err'), async (Live) => {
        const res = await Live.write('advance_clock', { months: +forward.dataset.forward });
        keep(EVENTS, res.events ?? []);
      });
    }
    const button = e.target.closest('[data-act]');
    if (!button) return;
    const act = button.dataset.act;
    if (act === 'split') return openSplit();
    if (act === 'later') return el('split').close();
    if (act === 'accept') return run(button, el('s-err'), (Live) => Live.write('save_envelopes', plan.proposal));
    if (act === 'setup') return run(button, el('setup-err'), (Live) => Live.api('/api/stripe/setup', { method: 'POST', body: '{}' }));
    if (act === 'income') {
      return run(button, el('d-err'), async (Live) => {
        const res = await Live.write('simulate_apia_advance', {});
        if (res.event) { keep(EVENTS, [res.event]); keep(ARRIVED, res.event.amount); }
      });
    }
  });
})();

}
