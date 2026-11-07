/* "Salariul tău": the farm's own year, from the money on hand to the salary it allows.
   Every line comes from salaryBreakdown and salaryMonths, so the page holds no figures.
   Signed out, the pension is the demo figure from plan-params.json (P24). */
(function () {
  const { exact } = CC;
  CC.start();

  const el = (id) => document.getElementById(id);
  const data = CC.data();
  const plan = CC.farmPlan();
  const E = CropEngine;
  const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  const monthWord = (key) => MONTHS[+key.split('-')[1] - 1];
  const monthName = (key) => `${monthWord(key)} ${key.slice(0, 4)}`;
  const monthRange = (from, to) => {
    if (from === to) return monthName(from);
    return from.slice(0, 4) === to.slice(0, 4) ? `${monthWord(from)}–${monthName(to)}` : `${monthName(from)}–${monthName(to)}`;
  };
  const lei = (bani) => `${exact(bani)} lei`;
  const signed = (bani) => (bani < 0 ? `−${lei(bani)}` : lei(bani));
  const luni = (n) => (n === 1 ? 'o lună' : `${n} luni`);
  const both = (words) => (words.length > 1 ? `${words.slice(0, -1).join(', ')} și ${words[words.length - 1]}` : words[0] ?? '');
  const YEARS = [['bad', 'An slab'], ['medium', 'An normal'], ['good', 'An bun']];
  let year = 'medium';
  let wholeYear = false;

  /* ---- Words for the plan's money lines ---- */
  const cropWord = (id) => (CC.harvests.cropName(id) || '').toLowerCase();
  const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  function incomeLabel(line) {
    if (line.kind === 'apia_advance') return 'Avans APIA';
    if (line.kind === 'apia_balance') return 'Restul de la APIA';
    if (line.kind === 'credit') return 'Credit';
    return `Vânzare ${cropWord(line.cropId)}`;
  }
  function costLabel(line) {
    if (line.kind === 'loan_repayment') return 'Creditul dat înapoi';
    return line.what ? `${capital(line.what)}, ${cropWord(line.cropId)}` : `Lucrări la ${cropWord(line.cropId)}`;
  }
  /* "din grâu", "de la APIA": where the next money comes from. */
  function fromWhere(lines) {
    const crops = [...new Set(lines.filter((l) => l.cropId).map((l) => cropWord(l.cropId)))];
    const parts = crops.length ? [`din ${both(crops)}`] : [];
    if (lines.some((l) => !l.cropId)) parts.push('de la APIA');
    return parts.join(' și ');
  }

  el('lead').textContent = `Cât poți scoate lună de lună din ${CC.FARM.summary}.`;

  const paidIn = (key) => (key === 'medium' ? plan.monthlySalary : E.salaryBreakdown(plan, key, data).salary);
  const yearLabel = (key) => YEARS.find(([k]) => k === key)[1];

  /* The sum of the amounts as printed, so a farmer adding them up gets the same figure. */
  function printedTotal(b) {
    const whole = (bani) => Math.round(bani / 100) * 100;
    const out = [...b.costs.map((l) => l.amount), b.pension];
    return whole(b.opening) + b.income.reduce((sum, l) => sum + whole(l.amount), 0) - out.reduce((sum, v) => sum + whole(v), 0);
  }

  /* ---- The headline: the salary, what is left at the tightest point, what comes next ---- */
  function renderHero(b, ledger) {
    const month = monthName(b.limitingMonth);
    const left = ledger.months.find((m) => m.key === b.limitingMonth).left;
    const next = b.nextIncome ? `În ${monthName(b.nextIncome.month)} intră ${lei(b.nextIncome.amount)} ${fromWhere(b.nextIncome.lines)}.` : '';
    el('h-label').textContent = `${yearLabel(year)}: ${b.deficit ? 'banii nu ajung' : 'poți scoate sigur'}`;
    el('h-amount').textContent = `${lei(ledger.salary)} pe lună`;
    if (b.deficit) {
      const without = b.withoutSetAsides < 0
        ? `Chiar dacă nu pui nimic deoparte, tot lipsesc ${lei(b.withoutSetAsides)}.`
        : `Dacă nu pui nimic deoparte, îți rămân ${lei(b.withoutSetAsides)}.`;
      el('h-why').textContent = `În ${month} lipsesc ${lei(printedTotal(b))}, chiar fără salariu. ${without} ${next}`.trim();
    } else if (b.nextIncome) {
      el('h-why').textContent = `În ${month} îți rămân ${lei(left)}, după toate plățile. ${next}`;
    } else {
      el('h-why').textContent = `Suma ține tot anul. În ${month} îți rămân ${lei(left)}.`;
    }
  }

  /* ---- From the money on hand to the salary ---- */
  const sumRow = (label, sub, amount, extra = '') => `<li class="${extra}"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span><b>${amount}</b></li>`;
  function renderSum(b, ledger) {
    const pension = plan.smoothing.pensionMonthly ?? 0;
    const printed = printedTotal(b);
    el('r-title').textContent = b.deficit ? 'De ce nu ajung banii' : `Cum am ajuns la ${lei(b.salary)}`;
    el('r-lines').innerHTML = [
      sumRow('Ai în cont', '', lei(b.opening)),
      ...b.income.map((l) => sumRow(incomeLabel(l), monthRange(l.firstMonth, l.lastMonth), `+${lei(l.amount)}`)),
      ...b.costs.map((l) => sumRow(costLabel(l), monthRange(l.firstMonth, l.lastMonth), `−${lei(l.amount)}`)),
      b.pension ? sumRow('<a href="pensie.html">Bătrânețe</a>', `${lei(pension)} × ${luni(b.months)}`, `−${lei(b.pension)}`) : '',
      sumRow(b.deficit ? 'Îți lipsesc' : 'Rămân pentru salariu', '', lei(printed), 'total'),
    ].join('');
    const rounded = b.salary !== Math.round(b.exact / 100) * 100;
    let end = `${lei(printed)} ÷ ${luni(b.months)} = ${lei(b.exact)} pe lună.${rounded ? ` Rotunjim în jos la ${lei(b.salary)}.` : ''}`;
    if (b.deficit) end = `Până în ${monthName(b.limitingMonth)} ies mai mulți bani decât intră, așa că nu poți scoate salariu.`;
    else if (b.salary === 0) end = `Sunt prea puțini bani ca să împărțim la ${luni(b.months)}.`;
    if (year === 'medium' && plan.salaryFixed !== null) end += ` Ai ales să scoți ${lei(ledger.salary)} pe lună.`;
    el('r-end').textContent = end;
  }

  /* ---- Month by month: months with nothing in them fold into one row ---- */
  function monthRows(months, b) {
    const rows = [];
    months.forEach((m) => {
      const lines = [...m.income.map((l) => [incomeLabel(l), `+${lei(l.amount)}`]), ...m.costs.map((l) => [costLabel(l), `−${lei(l.amount)}`])];
      const quiet = !lines.length && m.key !== b.limitingMonth;
      const last = rows[rows.length - 1];
      if (quiet && last?.quiet) { last.to = m.key; last.left = m.left; return; }
      rows.push({ from: m.key, to: m.key, left: m.left, lines, quiet });
    });
    return rows;
  }
  function renderMonths(b, ledger) {
    const pension = plan.smoothing.pensionMonthly ?? 0;
    const regular = both([ledger.salary ? `${lei(ledger.salary)} salariu` : '', pension ? `${lei(pension)} pentru bătrânețe` : ''].filter(Boolean));
    el('m-intro').textContent = regular ? `În fiecare lună ies ${regular}.` : '';
    el('m-intro').hidden = !regular;
    const stop = b.nextIncome?.month ?? b.limitingMonth;
    const end = ledger.months.findIndex((m) => m.key === stop);
    const shown = wholeYear ? ledger.months : ledger.months.slice(0, end + 1);
    const quietWord = ledger.salary && pension ? 'Doar salariul și pensia' : ledger.salary ? 'Doar salariul' : pension ? 'Doar pensia' : 'Nimic de plătit';
    el('m-list').innerHTML = monthRows(shown, b).map((r) => {
      const tight = r.from === b.limitingMonth;
      return `<li class="m-row${tight ? ' tight' : ''}">
        <div class="m-top-line"><b>${r.from === r.to ? monthName(r.from) : `${monthWord(r.from)}–${monthWord(r.to)}`}</b>${tight ? `<span class="tag d">${b.deficit ? 'Aici nu ajung banii' : 'Cea mai grea lună'}</span>` : ''}<span class="m-left${r.left < 0 ? ' short' : ''}">${signed(r.left)}</span></div>
        ${r.quiet ? `<p class="note">${quietWord}</p>` : ''}
        ${r.lines.length ? `<ul class="m-lines">${r.lines.map(([label, amount]) => `<li><span>${label}</span><b>${amount}</b></li>`).join('')}</ul>` : ''}
      </li>`;
    }).join('');
    const stated = b.nextIncome && plan.salaryFixed === null;
    el('m-note').textContent = stated ? `Când intră banii ${fromWhere(b.nextIncome.lines)}, recalculăm salariul.` : '';
    el('m-note').hidden = !stated;
    el('m-more').hidden = end >= ledger.months.length - 1;
    el('m-more').textContent = wholeYear ? 'Arată mai puțin' : 'Arată tot anul';
  }

  function render() {
    const b = E.salaryBreakdown(plan, year, data);
    const ledger = E.salaryMonths(plan, year, data);
    document.querySelectorAll('[data-year]').forEach((button) => button.setAttribute('aria-pressed', button.dataset.year === year));
    renderHero(b, ledger);
    renderSum(b, ledger);
    renderMonths(b, ledger);
  }

  el('years').innerHTML = YEARS.map(([k, label]) => `<button type="button" data-year="${k}"><span>${label}</span><b>${lei(paidIn(k))}</b></button>`).join('');

  /* ---- What the plan rests on ---- */
  const kilo = (pricePerT) => (pricePerT / 100000).toFixed(2).replace('.', ',');
  const SOURCE = { own: 'cifrele tale', gathered: 'din Recolte', average: 'media noastră' };
  const crops = plan.economics.map((c) => `${cropWord(c.cropId)} ${CC.num(c.productionT)} t la ${kilo(c.pricePerT)} lei/kg (${SOURCE[CC.figureSource(c.cropId)]})`);
  const pension = CC.pensionBani();
  const pensionLine = pension ? `Bătrânețe: ${lei(pension)} pe lună${CC.onServer || CC.ownPension() !== null ? '' : ', ca exemplu'}.` : 'Nu pui bani deoparte pentru bătrânețe.';
  el('assumed').innerHTML = [
    `Am pornit de la ${lei(CC.onServer ? plan.startBalance : CC.FARM.startBalanceBani)} în cont.`,
    crops.length ? `Într-un an normal: ${both(crops)}.` : '',
    'Banii de la APIA sunt puși în ultima zi în care pot veni, ca planul să țină și dacă întârzie.',
    pensionLine,
  ].filter(Boolean).map((text) => `<li>${text}</li>`).join('');

  document.addEventListener('click', (e) => {
    const button = e.target.closest('[data-year]');
    if (button) { year = button.dataset.year; render(); }
    if (e.target.closest('#m-more')) { wholeYear = !wholeYear; render(); }
  });
  render();

  window.__salariu = { plan };
})();
