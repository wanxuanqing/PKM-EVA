import pointer from '../data/current.json';
import type { Catalog } from '../types';
export async function loadCatalog(): Promise<Catalog> {
  const response = await fetch(pointer.file);
  if (!response.ok)
    throw new Error(
      'The catalog could not be loaded. Connect once to download it, then try again.',
    );
  const raw = await response.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', raw);
  const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  if (hash !== pointer.sha256)
    throw new Error(
      'The catalog download is incomplete or belongs to a different version. Reload to retry.',
    );
  const data = JSON.parse(new TextDecoder().decode(raw)) as Catalog;
  if (data.schema !== 1 || data.version !== pointer.version)
    throw new Error('App and catalog versions do not match. Reload to finish the update.');
  return data;
}
export function sourceURL(data: Catalog, id: string): string | undefined {
  if (id.startsWith('https://')) return id;
  return data.sources.find((s) => s.id === id)?.url;
}
