import type { DiaryData } from './types';

export const KEY_SIZE = 128;      // bytes – matches server constant
const SALT_LEN   = 16;
const IV_LEN     = 12;
const PBKDF2_ITERS = 200_000;

// ── Base64 helpers ──────────────────────────────────────────────────────────

/** Safe for arbitrary byte arrays (avoids spread-induced stack overflow). */
export function uint8ToBase64(arr: Uint8Array): string {
    const CHUNK = 0x8000;
    let bin = '';
    for (let i = 0; i < arr.length; i += CHUNK) {
        bin += String.fromCharCode(...arr.subarray(i, Math.min(i + CHUNK, arr.length)));
    }
    return btoa(bin);
}

export function base64ToUint8(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

// ── PBKDF2 key derivation ───────────────────────────────────────────────────

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const raw = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
                                              'PBKDF2',
                                              false,
                                              ['deriveKey'],
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERS, hash: 'SHA-256' },
        raw,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
}

// ── Serialization ───────────────────────────────────────────────────────────
// File areas: [начало области N]<base64-encoded UTF-8 JSON>[конец области N]

function jsonToB64(v: unknown): string {
    return uint8ToBase64(new TextEncoder().encode(JSON.stringify(v)));
}

function b64ToJson<T>(b64: string): T {
    return JSON.parse(new TextDecoder().decode(base64ToUint8(b64))) as T;
}

function wrapArea(n: number, payload: string): string {
    return `[начало области ${n}]${payload}[конец области ${n}]`;
}

function extractArea(text: string, n: number): string | null {
    const open  = `[начало области ${n}]`;
    const close = `[конец области ${n}]`;
    const s = text.indexOf(open);
    const e = text.indexOf(close);
    if (s === -1 || e < s) return null;
    return text.slice(s + open.length, e);
}

/** Build the plaintext that gets encrypted: writeKey || area-format text. */
function buildPlaintext(writeKey: Uint8Array, data: DiaryData): Uint8Array {
    const text =
    wrapArea(1, jsonToB64(data.events)) +
    wrapArea(2, jsonToB64(data.articles)) +
    wrapArea(3, jsonToB64(data.threads));
    const textBytes = new TextEncoder().encode(text);
    const buf = new Uint8Array(KEY_SIZE + textBytes.length);
    buf.set(writeKey);
    buf.set(textBytes, KEY_SIZE);
    return buf;
}

function parsePlaintext(plain: Uint8Array): { writeKey: Uint8Array; data: DiaryData } {
    const writeKey = plain.slice(0, KEY_SIZE);
    const text     = new TextDecoder().decode(plain.slice(KEY_SIZE));
    const e1 = extractArea(text, 1);
    const e2 = extractArea(text, 2);
    const e3 = extractArea(text, 3);
    return {
        writeKey,
        data: {
            events:   e1 ? b64ToJson<DiaryData['events']>(e1)   : [],
            articles: e2 ? b64ToJson<DiaryData['articles']>(e2) : [],
            threads:  e3 ? b64ToJson<DiaryData['threads']>(e3)  : [],
        },
    };
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Encrypt diary data → opaque bytes to send as the request body.
 * Layout: [16 salt][12 IV][AES-GCM ciphertext of (writeKey || area-text)]
 */
export async function encryptDiary(
    writeKey: Uint8Array,
    data: DiaryData,
    password: string,
): Promise<Uint8Array> {
    const plain  = buildPlaintext(writeKey, data);
    const salt   = crypto.getRandomValues(new Uint8Array(SALT_LEN));
    const iv     = crypto.getRandomValues(new Uint8Array(IV_LEN));
    const aesKey = await deriveKey(password, salt);
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, aesKey, plain as BufferSource);

    const out = new Uint8Array(SALT_LEN + IV_LEN + cipher.byteLength);
    out.set(salt);
    out.set(iv, SALT_LEN);
    out.set(new Uint8Array(cipher), SALT_LEN + IV_LEN);
    return out;
}

/** Decrypt the blob returned by GET /api/diary/:username. Throws on bad password. */
export async function decryptDiary(
    blob: Uint8Array,
    password: string,
): Promise<{ writeKey: Uint8Array; data: DiaryData }> {
    if (blob.length < SALT_LEN + IV_LEN + 16) throw new Error('Данные повреждены');
    const salt   = blob.slice(0, SALT_LEN);
    const iv     = blob.slice(SALT_LEN, SALT_LEN + IV_LEN);
    const cipher = blob.slice(SALT_LEN + IV_LEN);
    const aesKey = await deriveKey(password, salt as unknown as Uint8Array<ArrayBuffer>);
    let plain: ArrayBuffer;
    try {
        plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, aesKey, cipher as BufferSource);
    } catch {
        throw new Error('Неверный пароль');
    }
    return parsePlaintext(new Uint8Array(plain));
}

/** Generate a cryptographically random 128-byte write key. */
export function generateWriteKey(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(KEY_SIZE));
}
