import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Pinned upstream hashes keep scientific asset parity tests portable.
const manifest = JSON.parse(await readFile(new URL('../docs/nimer-source-manifest.json', import.meta.url)));
export function assertSource(path, bytes) {
  const record = manifest.files.find(file => file.source === path);
  if (!record) throw Error('Missing upstream provenance: ' + path);
  if (bytes.length !== record.bytes || createHash('sha256').update(bytes).digest('hex') !== record.sha256)
    throw Error('Asset differs from pinned upstream commit ' + manifest.commit + ': ' + path);
}
export const assertOceanSource = (path, bytes) => assertSource('data/processed/oscar/' + path, bytes);
