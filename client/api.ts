import { uint8ToBase64 } from './crypto';

const BASE = '/api/diary';

function keyHeaders(key: Uint8Array): Record<string, string> {
  return { 'X-Diary-Key': uint8ToBase64(key) };
}

export async function apiCreate(
  username: string,
  writeKey: Uint8Array,
  body: Uint8Array,
): Promise<void> {
  const res = await fetch(`${BASE}/${username}`, {
    method: 'POST',
    headers: { ...keyHeaders(writeKey), 'Content-Type': 'application/octet-stream' },
    body: body as BodyInit,
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function apiRead(username: string): Promise<Uint8Array> {
  const res = await fetch(`${BASE}/${username}`);
  if (!res.ok) throw new Error(await res.text());
  return new Uint8Array(await res.arrayBuffer());
}

export async function apiUpdate(
  username: string,
  writeKey: Uint8Array,
  body: Uint8Array,
): Promise<void> {
  const res = await fetch(`${BASE}/${username}`, {
    method: 'PUT',
    headers: { ...keyHeaders(writeKey), 'Content-Type': 'application/octet-stream' },
    body: body as BodyInit,
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function apiDelete(
  username: string,
  writeKey: Uint8Array,
): Promise<void> {
  const res = await fetch(`${BASE}/${username}`, {
    method: 'DELETE',
    headers: keyHeaders(writeKey),
  });
  if (!res.ok) throw new Error(await res.text());
}
