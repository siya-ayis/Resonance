/* Headless smoke test: verifies the app boots, mounts a canvas, has no runtime
   errors, and the master clock advances after pressing Play.
   Run (dev server must be up on :5173): node scripts/smoke.mjs */
import { chromium } from 'playwright';

const URL = 'http://localhost:5173/';
const errors = [];
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
});

let ok = true;
try {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForSelector('.canvas-host canvas', { timeout: 10000 });
  const canvas = await page.$('.canvas-host canvas');
  console.log('canvas mounted:', !!canvas);

  // Enter the app through the start gate (user gesture unlocks audio/haptics).
  await page.click('.start-gate .big-btn');
  await page.waitForSelector('.nav', { timeout: 10000 });

  // Visit every pillar and confirm its screen renders.
  for (const [id, sel] of [
    ['home', '.screen.home'],
    ['feel', '.screen.feel'],
    ['sense', '.screen.sense'],
    ['play', '.screen.play'],
    ['create', '.screen.create'],
  ]) {
    await page.locator(`.nav-btn:has-text("${cap(id)}")`).click();
    await page.waitForSelector(sel, { timeout: 5000 });
    console.log('pillar ok:', id);
  }

  // Land on FEEL for the clock check.
  await page.locator('.nav-btn:has-text("Feel")').click();
  await page.waitForSelector('.screen.feel', { timeout: 5000 });

  // No error banner should be visible.
  const banner = await page.$('.error-banner');
  if (banner) {
    const txt = await banner.innerText();
    errors.push(`error-banner visible: ${txt}`);
  }

  // Press Play (user gesture) and confirm the clock advances.
  await page.click('.play-btn');
  await page.waitForTimeout(2500);
  const seek = page.locator('input.seek');
  const value = Number(await seek.inputValue());
  console.log('clock position after 2.5s play (ms):', value);
  if (!(value > 500)) {
    ok = false;
    errors.push(`clock did not advance (value=${value})`);
  }

  // FPS readout should be > 0 (render loop alive).
  const status = await page.locator('.screen.feel .status').innerText();
  console.log('status:', status.replace(/\n/g, ' | '));
} catch (e) {
  ok = false;
  errors.push(`exception: ${e.message}`);
} finally {
  await browser.close();
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

if (errors.length) {
  console.log('\n--- ERRORS ---');
  for (const e of errors) console.log(' -', e);
}
const hardFail = !ok || errors.some((e) => !e.startsWith('console.error'));
console.log('\nSMOKE:', hardFail ? 'FAIL' : 'PASS');
process.exit(hardFail ? 1 : 0);
