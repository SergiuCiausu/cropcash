// Saves Ion's logged-in session for the demo-deck captures. Credentials come from .env.
// Run from pptx/: node --env-file=../.env save-login.cjs
const { chromium } = require('C:/Users/ciaus/.claude/skills/demo-deck/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto(`${process.env.DECK_BASE_URL || 'http://localhost:5173'}/login`);
  await p.waitForLoadState('networkidle');
  await p.waitForTimeout(1500); // React hydration: a submit before it reloads the page
  await p.fill('input[type=email]', process.env.DEMO_EMAIL);
  await p.fill('input[type=password]', process.env.DEMO_PASSWORD);
  await p.click("main button[type=submit], form button[type=submit]:has-text('Intră')");
  await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 }).catch(async (e) => { console.log('still on login:', (await p.textContent('form')).slice(0, 200)); throw e; });
  await p.waitForTimeout(3000);
  await p.context().storageState({ path: require('path').join(__dirname, 'build', 'demo-login.json') });
  console.log('saved, now at', p.url());
  await b.close();
})();
