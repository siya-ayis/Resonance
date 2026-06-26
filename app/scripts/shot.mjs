/* Capture a screenshot of FEEL after a few seconds of playback, to eyeball the
   visuals. Dev server must be up on :5173.  node scripts/shot.mjs [out.png] [ms] */
import { chromium } from 'playwright';

const OUT = process.argv[2] || 'shot.png';
const MS = Number(process.argv[3] || 4000);
const URL = 'http://localhost:5173/';

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 420, height: 880 } });
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
  await page.locator('.nav-btn:has-text("Feel")').click();
  await page.waitForSelector('.screen.feel', { timeout: 5000 });
  await page.click('.play-btn');
  await page.waitForTimeout(MS);
  await page.screenshot({ path: OUT });
  console.log('saved', OUT);
} catch (e) {
  console.log('ERROR', e.message);
} finally {
  await browser.close();
}
if (errors.length) {
  console.log('--- page errors ---');
  for (const e of errors) console.log(' -', e);
}
