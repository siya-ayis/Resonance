/* Verify SENSE: fake mic device, click Start, confirm it reaches "listening"
   (mic-fix: no hang) and capture the note readout + dye. node scripts/sense-shot.mjs */
import { chromium } from 'playwright';

const URL = 'http://localhost:5173/';
const browser = await chromium.launch({
  args: [
    '--use-gl=swiftshader',
    '--ignore-gpu-blocklist',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    ...(process.env.AUDIO_FILE ? [`--use-file-for-fake-audio-capture=${process.env.AUDIO_FILE}`] : []),
  ],
});
const ctx = await browser.newContext({
  permissions: ['microphone'],
  viewport: { width: 420, height: 880 },
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
});
try {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForSelector('.canvas-host canvas', { timeout: 10000 });
  await page.click('.start-gate .big-btn');
  await page.waitForSelector('.nav', { timeout: 10000 });
  await page.locator('.nav-btn:has-text("Sense")').click();
  await page.waitForSelector('.screen.sense', { timeout: 5000 });
  await page.click('.sense-cta .big-btn');
  // Wait for listening state (the Stop button only appears once listening).
  await page.waitForSelector('.sense-controls', { timeout: 8000 });
  console.log('SENSE reached listening state (mic-fix OK)');
  await page.waitForTimeout(3500);
  const swara = await page.locator('.note-swara').innerText().catch(() => '(none)');
  const western = await page.locator('.note-western').innerText().catch(() => '(none)');
  console.log('readout swara:', swara, '| western:', western);
  await page.screenshot({ path: 'sense.png' });
  console.log('saved sense.png');
} catch (e) {
  console.log('ERROR', e.message);
} finally {
  await browser.close();
}
if (errors.length) {
  console.log('--- page errors ---');
  for (const e of errors) console.log(' -', e);
}
