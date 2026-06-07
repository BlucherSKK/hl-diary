import type { DiaryData } from './types';
import { encryptDiary } from './crypto';
import { apiUpdate } from './api';

// ── Session ─────────────────────────────────────────────────────────────────

export interface Session {
  username: string;
  writeKey: Uint8Array;
  password: string;
  data: DiaryData;
}

export let session: Session | null = null;
export const setSession   = (s: Session): void => { session = s; };
export const clearSession = (): void            => { session = null; };

// ── Save status ─────────────────────────────────────────────────────────────

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
type StatusListener = (status: SaveStatus, msg?: string) => void;

let _status: SaveStatus = 'idle';
let _timer: ReturnType<typeof setTimeout> | null = null;
const _listeners = new Set<StatusListener>();

export function onSaveStatus(fn: StatusListener): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

function emit(status: SaveStatus, msg?: string): void {
  _status = status;
  _listeners.forEach(fn => fn(status, msg));
}

/** Schedule an auto-save after 1.5 s of inactivity. */
export function scheduleSave(): void {
  if (!session) return;
  if (_timer !== null) clearTimeout(_timer);
  emit('pending');
  _timer = setTimeout(doSave, 1_500);
}

/** Flush immediately (also cancels any pending timer). */
export async function doSave(): Promise<void> {
  if (_timer !== null) { clearTimeout(_timer); _timer = null; }
  if (!session) return;
  emit('saving');
  try {
    const blob = await encryptDiary(session.writeKey, session.data, session.password);
    await apiUpdate(session.username, session.writeKey, blob);
    emit('saved');
    setTimeout(() => { if (_status === 'saved') emit('idle'); }, 2_500);
  } catch (e) {
    emit('error', (e as Error).message ?? String(e));
  }
}
