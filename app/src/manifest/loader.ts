import { validateManifest } from './validate';
import type { Manifest } from './types';

export interface LoadedManifest {
  manifest: Manifest;
  /** Base URL for resolving relative audio paths in the manifest. */
  baseUrl: string;
}

/** Fetch + validate a manifest. Throws with readable errors if invalid. */
export async function loadManifest(url: string): Promise<LoadedManifest> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch manifest (${res.status}): ${url}`);
  const raw = await res.json();
  const result = validateManifest(raw);
  if (!result.ok || !result.manifest) {
    throw new Error(`Invalid manifest ${url}:\n - ${result.errors.join('\n - ')}`);
  }
  const baseUrl = url.slice(0, url.lastIndexOf('/'));
  return { manifest: result.manifest, baseUrl };
}
