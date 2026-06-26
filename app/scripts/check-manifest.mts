/* Validates the generated sample manifest against the zod + semantic harness.
   Run: npx tsx scripts/check-manifest.mts */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateManifest } from '../src/manifest/validate';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Optional path arg lets the Python pipeline cross-validate its output against
// the renderer's OWN validator (single source of truth). Defaults to the demo.
const arg = process.argv[2];
const path = arg
  ? resolve(process.cwd(), arg)
  : resolve(__dirname, '../public/manifests/song1/manifest.json');
const raw = JSON.parse(readFileSync(path, 'utf-8'));

const result = validateManifest(raw);
if (result.ok) {
  console.log('VALID:', path);
  console.log(
    `  sections=${result.manifest!.sections.length} beats=${result.manifest!.beats.length} ` +
      `haptics=${result.manifest!.haptics.length} lyrics=${result.manifest!.lyrics.length}`,
  );
  process.exit(0);
} else {
  console.error('INVALID:', path);
  for (const e of result.errors) console.error('  -', e);
  process.exit(1);
}
