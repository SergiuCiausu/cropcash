/* Reading a paper the farmer uploads. Every button in the app goes through here.
   The file goes to the API once and is kept nowhere. The page gets the fields back and fills in a
   form, or asks in a sheet, so nothing is saved until the farmer taps. Reading needs internet, so
   offline the button is disabled and typing by hand still works. Nothing here moves money. */
window.Papers = (function () {
  const ASKED = 'cropcash-paper-ok';
  const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';
  const JPEG_QUALITY = 0.8;
  const OFFLINE = 'Ca să citim hârtia ai nevoie de internet. Poți scrie și de mână.';
  const limits = () => CC.data().params.documents;
  const { esc } = CC;

  /* ---- The button ---- */
  /* A file input without "capture" offers both the camera and the files, so one button is enough. */
  function button(label, signIn = 'login.html') {
    if (!CC.isSignedIn()) return `<a class="btn btn-line paper-btn" href="${esc(signIn)}">Intră în cont ca să încarci hârtia</a>`;
    return `<button type="button" class="btn btn-line paper-btn" data-paper${navigator.onLine ? '' : ' disabled'}>${esc(label)}</button><p class="note paper-off" data-paper-off${navigator.onLine ? ' hidden' : ''}>${OFFLINE}</p>`;
  }
  function syncOnline() {
    document.querySelectorAll('[data-paper]').forEach((b) => { b.disabled = !navigator.onLine; });
    document.querySelectorAll('[data-paper-off]').forEach((p) => { p.hidden = navigator.onLine; });
  }
  addEventListener('online', syncOnline);
  addEventListener('offline', syncOnline);

  /* ---- The sheet ---- */
  let box = null;
  let locked = false;
  function sheet() {
    if (box) return box;
    box = document.createElement('dialog');
    box.className = 'h-sheet paper-sheet';
    box.setAttribute('aria-labelledby', 'paper-title');
    box.addEventListener('cancel', (e) => { if (locked) e.preventDefault(); });
    document.body.append(box);
    return box;
  }
  const open = (html) => {
    const d = sheet();
    d.innerHTML = html;
    if (!d.open) d.showModal();
    return d;
  };
  const close = () => { if (box?.open) box.close(); };
  const heading = (title) => `<h2 id="paper-title">${esc(title)}</h2>`;

  /* Resolves with the value of the button tapped. Escape counts as the last button. */
  const ask = (title, text, buttons) => new Promise((done) => {
    const rows = buttons.map(([value, label], i) => `<button type="button" class="btn ${i ? 'btn-line' : 'btn-dark'}" data-answer="${esc(value)}">${esc(label)}</button>`).join('');
    const d = open(`${heading(title)}<p class="note">${esc(text)}</p><div class="ob-actions">${rows}</div>`);
    const finish = (value) => { d.onclick = null; d.oncancel = null; close(); done(value); };
    d.onclick = (e) => { const b = e.target.closest('[data-answer]'); if (b) finish(b.dataset.answer); };
    d.oncancel = () => finish(buttons[buttons.length - 1][0]);
  });
  const tell = (title, text) => ask(title, text, [['ok', 'Închide']]);

  function waiting() {
    locked = true;
    open(`${heading('Citesc hârtia…')}<p class="note" role="status">Durează câteva secunde. Nu închide pagina.</p>`);
  }
  function doneWaiting() { locked = false; close(); }

  /* ---- Choosing the files ---- */
  function chooseFiles(multiple) {
    return new Promise((done) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = ACCEPT;
      input.multiple = multiple;
      input.hidden = true;
      const finish = (files) => { input.remove(); done(files); };
      input.addEventListener('change', () => finish([...input.files]));
      input.addEventListener('cancel', () => finish([]));
      document.body.append(input);
      input.click();
    });
  }
  const dataOf = (blob) => new Promise((done, fail) => {
    const reader = new FileReader();
    reader.onload = () => done(String(reader.result).split(',')[1]);
    reader.onerror = () => fail(reader.error);
    reader.readAsDataURL(blob);
  });
  /* A phone photo is several megabytes, too much for a weak signal, and text stays readable smaller. */
  async function prepare(file) {
    if (file.type === 'application/pdf') return { mediaType: file.type, data: await dataOf(file), bytes: file.size };
    const side = limits().photo_long_side_px.value;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise((done) => { canvas.toBlob(done, 'image/jpeg', JPEG_QUALITY); });
    return { mediaType: 'image/jpeg', data: await dataOf(blob), bytes: blob.size };
  }

  /* A long paper in photos comes page by page, because the camera takes one at a time. */
  async function gather(pages) {
    const maxPages = limits().max_pages.value;
    const out = [];
    for (;;) {
      const picked = await chooseFiles(pages);
      for (const file of picked) out.push(await prepare(file));
      if (!out.length) return out;
      if (out.some((f) => f.mediaType === 'application/pdf') || !pages || out.length >= maxPages) return out;
      const more = await ask(out.length === 1 ? 'Ai o pagină' : `Ai ${out.length} pagini`, 'Dacă hârtia are mai multe pagini, adaugă-le pe toate.', [['read', 'Citește hârtia'], ['more', 'Mai adaug o pagină'], ['stop', 'Renunță']]);
      if (more === 'stop') return [];
      if (more === 'read') return out;
    }
  }

  async function consent() {
    try { if (localStorage.getItem(ASKED)) return true; } catch (e) { /* asks every time */ }
    const answer = await ask('Citim hârtia cu un program AI', 'Hârtia ajunge la serviciul care o citește și poate avea numele, CNP-ul sau contul tău. Păstrăm doar cifrele pe care le confirmi tu, nu și hârtia.', [['yes', 'Bine așa'], ['no', 'Renunță']]);
    if (answer !== 'yes') return false;
    try { localStorage.setItem(ASKED, '1'); } catch (e) { /* asks again next time */ }
    return true;
  }

  /* ---- Reading ---- */
  const ERRORS = {
    too_many_reads: 'Ai citit multe hârtii azi. Încearcă mâine sau scrie de mână.',
    too_large: 'Hârtia e prea mare. Fă câte o poză la fiecare pagină.',
    too_many: 'Sunt prea multe pagini pentru o singură hârtie.',
    bad_file: 'Nu putem deschide fișierul. Merge o poză sau un PDF.',
    /* The paper is fine here, so asking for a clearer photo would only waste the farmer's time. */
    read_failed: 'Acum nu putem citi hârtii. Încearcă mai târziu sau scrie de mână.',
    reader_off: 'Acum nu putem citi hârtii. Încearcă mai târziu sau scrie de mână.',
    offline: OFFLINE,
    network: OFFLINE,
  };
  const SEEN = {
    invoice: 'Asta pare o factură. O poți nota la Recolte.',
    sale_paper: 'Asta pare o hârtie de vânzare. O poți nota la Recolte.',
    apia_cerere: 'Asta pare cererea de la APIA, nu decizia de plată.',
    apia_decizie: 'Asta pare o decizie APIA. O poți pune la Subvenții.',
    other: 'Nu am putut citi hârtia. Fă o poză mai clară, cu toată foaia în cadru, sau scrie de mână.',
  };

  /* Resolves with what was read, or null if nothing should change. It says what went wrong itself. */
  async function pick({ accepts, pages = false }) {
    if (!(await consent())) return null;
    let files;
    try {
      files = await gather(pages);
    } catch (e) {
      await tell('Nu am putut citi hârtia', ERRORS.bad_file);
      return null;
    }
    if (!files.length) return null;
    if (files.reduce((sum, f) => sum + f.bytes, 0) > limits().max_mb.value * 1024 * 1024) {
      await tell('Nu am putut citi hârtia', ERRORS.too_large);
      return null;
    }
    waiting();
    let reading = null, problem = null;
    try {
      const Live = await CC.live();
      reading = await Live.write('read_document', { files: files.map(({ mediaType, data }) => ({ mediaType, data })) });
      if (!accepts.includes(reading.kind)) problem = SEEN[reading.kind];
    } catch (e) {
      problem = ERRORS[e?.code] ?? SEEN.other;
    }
    doneWaiting();
    if (!problem) return reading;
    await tell('Nu am putut folosi hârtia', problem);
    return null;
  }

  /* ---- Confirming the total on a payment decision ---- */
  /* `effect` turns the amount typed into a line about what changes. Resolves with bani, or null. */
  function confirmDecision(reading, effect) {
    const campaign = CC.data().subsidies.meta.campaign_year;
    if (reading.year && reading.year !== campaign) {
      return tell(`Decizia e pentru ${reading.year}`, `Planul tău e pentru ${campaign}, așa că nu folosim suma de pe ea.`).then(() => null);
    }
    return new Promise((done) => {
      const amount = reading.amountBani ? CC.cents(reading.amountBani) : '';
      const d = open(`${heading('Ce am citit')}
        <p class="note">${reading.amountBani ? 'Verifică suma cu cea de pe hârtie.' : 'Nu am găsit suma totală. Scrie-o de pe hârtie.'} Să fie suma pentru tot anul ${campaign}, nu doar avansul.</p>
        <label class="ob-field">Suma aprobată, în lei<input id="paper-amount" value="${esc(amount)}" inputmode="decimal" autocomplete="off"></label>
        <p class="note paper-effect" id="paper-effect" aria-live="polite"></p>
        <p class="ob-err" id="paper-err" role="alert" hidden></p>
        <div class="ob-actions"><button type="button" class="btn btn-dark" data-yes>Bine așa</button><button type="button" class="btn btn-line" data-no>Renunță</button></div>`);
      const field = d.querySelector('#paper-amount');
      const show = () => {
        const bani = CropEngine.parseLeiText(field.value);
        d.querySelector('#paper-effect').textContent = bani && effect ? effect(bani) : '';
      };
      const finish = (value) => { d.onclick = null; d.oninput = null; d.oncancel = null; close(); done(value); };
      d.oninput = show;
      d.oncancel = () => finish(null);
      d.onclick = (e) => {
        if (e.target.closest('[data-no]')) return finish(null);
        if (!e.target.closest('[data-yes]')) return undefined;
        const bani = CropEngine.parseLeiText(field.value);
        if (bani) return finish(bani);
        const err = d.querySelector('#paper-err');
        err.textContent = 'Scrie suma ca număr, de exemplu 16.900,50.';
        err.hidden = false;
        return undefined;
      };
      show();
    });
  }

  return { button, pick, tell, confirmDecision };
})();
