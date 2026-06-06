/** Simple 8-char random ID. */
export function nanoid(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Current unix time in seconds. */
export function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}

const _pad = (n: number) => String(n).padStart(2, '0');

/** Format unix timestamp as "Mon DD YYYY" */
export function fmtDate(ts: number): string {
  const d = new Date(ts * 1000);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`;
}

/** Format unix timestamp as "HH:MM" */
export function fmtTime(ts: number): string {
  const d = new Date(ts * 1000);
  return `${_pad(d.getHours())}:${_pad(d.getMinutes())}`;
}

/** Format unix timestamp as "Mon DD HH:MM" */
export function fmtDateTime(ts: number): string {
  return `${fmtDate(ts)} ${fmtTime(ts)}`;
}

/** Read a File as base64 (no data: prefix). */
export function readFileB64(file: File): Promise<{ data: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve({ data: result.slice(comma + 1), mime: file.type });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Insert text at the current cursor position in a textarea. */
export function insertAtCursor(el: HTMLTextAreaElement, text: string): void {
  const start = el.selectionStart ?? el.value.length;
  const end   = el.selectionEnd   ?? el.value.length;
  el.value = el.value.slice(0, start) + text + el.value.slice(end);
  el.selectionStart = el.selectionEnd = start + text.length;
  el.dispatchEvent(new Event('input'));
}

/** HTML-escape a string. */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
