/* Verifies the new auto-stop-at-end behavior in silent-clock mode:
   seek near the end, play, and confirm playback settles at the end (button
   returns to Play) and is then replayable from the start.
   Run (dev server up on :5173): node scripts/check-end.mjs */
import { chromium } from 'playwright';

const URL = 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

let ok = true;
const fail = (m) => { ok = false; errors.push(m); };
try {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForSelector('.canvas-host canvas', { timeout: 10000 });

  // Enter the app and navigate to FEEL (where the transport lives).
  await page.click('.start-gate .big-btn');
  await page.locator('.nav-btn:has-text("Feel")').click();
  await page.waitForSelector('.screen.feel', { timeout: 5000 });

  const seek = page.locator('input.seek');
  // Wait for the manifest to load (seek max reflects real duration).
  await page.waitForFunction(
    () => Number(document.querySelector('input.seek')?.getAttribute('max')) > 1000,
    { timeout: 10000 },
  );
  const dur = Number(await seek.getAttribute('max'));

  // Seek to ~1s before the end, then play and let it run past the end.
  await seek.fill(String(dur - 1000));
  await page.click('.play-btn');
  await page.waitForTimeout(2000);

  const playLabel = await page.locator('.play-btn').getAttribute('aria-label');
  const endPos = Number(await seek.inputValue());
  console.log(`after running past end: button="${playLabel}" pos=${endPos} dur=${dur}`);
  if (playLabel !== 'Play') fail(`expected auto-stop (button "Play") but got "${playLabel}"`);
  if (endPos < dur - 100) fail(`expected position to settle at end (~${dur}) but got ${endPos}`);

  // Replay from start: pressing play after end should restart at 0.
  await page.click('.play-btn');
  await page.waitForTimeout(700);
  const replayPos = Number(await seek.inputValue());
  console.log(`after replay: pos=${replayPos}`);
  if (!(replayPos > 100 && replayPos < dur - 1500)) fail(`expected replay from start, pos=${replayPos}`);
} catch (e) {
  fail(`exception: ${e.message}`);
} finally {
  await browser.close();
}

if (errors.length) { console.log('\n--- ERRORS ---'); for (const e of errors) console.log(' -', e); }
console.log('\nEND-CHECK:', ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
