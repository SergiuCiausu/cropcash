/* Ported from farm-app by web/scripts/port-legacy.mjs. Edit farm-app, or edit here and stop re-running the port. */
/* eslint-disable */
// @ts-nocheck
export default function install() {
/* "Intră în cont": sign in, sign up, and the end of sign-out.
   Needs internet, and says so. A farmer already signed in never stops here, online or not. */
(function () {
  const el = (id) => document.getElementById(id);
  const TEXT = Live.AUTH_TEXT;
  const auth = Live.auth();
  const params = new URLSearchParams(location.search);
  const next = Live.safeNext(params.get('next'));
  let mode = 'login';

  try {
    const saved = localStorage.getItem('farm-palette:2-rail');
    if (saved) window.FF.palette(saved, false);
  } catch (e) { /* private window */ }

  function show(id, text) {
    el(id).textContent = text ?? '';
    el(id).hidden = !text;
  }
  const clearMessages = () => { show('error'); show('info'); };

  function setBusy(busy) {
    el('submit').disabled = busy;
    el('switch').disabled = busy;
    el('submit').textContent = busy ? TEXT.wait : TEXT[mode === 'login' ? 'loginButton' : 'registerButton'];
  }

  function setMode(value) {
    mode = value;
    const login = mode === 'login';
    el('title').textContent = TEXT[login ? 'loginTitle' : 'registerTitle'];
    document.title = `${el('title').textContent} · CropCash`;
    el('switch').textContent = TEXT[login ? 'switchToRegister' : 'switchToLogin'];
    el('password').autocomplete = login ? 'current-password' : 'new-password';
    show('hint', login ? null : TEXT.passwordHint);
    setBusy(false);
  }

  const enterApp = async () => location.replace(await Live.landingPage(next));

  async function submit() {
    const email = el('email').value.trim();
    const password = el('password').value;
    clearMessages();
    if (!navigator.onLine) return show('error', TEXT.errors.offline);
    setBusy(true);
    try {
      if (mode === 'login') {
        await auth.signIn(email, password);
        return await enterApp();
      }
      const ready = await auth.signUp(email, password, new URL('/login', location.href).href);
      if (ready) return await enterApp();
      setMode('login');
      show('info', TEXT.checkEmail);
    } catch (error) {
      show('error', TEXT.errors[Live.authErrorKey(error, navigator.onLine)]);
    }
    setBusy(false);
  }

  el('form').addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  el('switch').addEventListener('click', () => { clearMessages(); setMode(mode === 'login' ? 'register' : 'login'); });

  el('mark').innerHTML = window.FF.icon('sprout');
  el('tagline').textContent = TEXT.tagline;
  el('email-label').textContent = TEXT.email;
  el('password-label').textContent = TEXT.password;
  setMode('login');

  (async () => {
    if (params.has('signout')) {
      await auth.signOut();
      history.replaceState(null, '', location.pathname);
      return;
    }
    const failed = Live.linkErrorKey(location.hash);
    if (failed) {
      show('error', TEXT.errors[failed]);
      return;
    }
    if (await auth.isSignedIn()) await enterApp();
  })();
})();

}
