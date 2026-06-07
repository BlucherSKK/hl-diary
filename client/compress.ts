/**
 * Client-side JPEG compression with CDE-style progress dialog.
 * Tries quality 1.0 → 0.9 → … → 0.05 until blob size < MAX_BYTES.
 */

const MAX_BYTES = 5 * 1_048_576; // 5 MB
const QUALITIES = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.05];

export interface CompressResult {
    data:    string;          // base64, no data: prefix
    mime:    'image/jpeg';
    size:    number;          // final blob bytes
    quality: number;          // final quality used
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtBytes(n: number): string {
    return n >= 1_048_576
    ? (n / 1_048_576).toFixed(2) + ' MB'
    : (n / 1024).toFixed(0) + ' KB';
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', quality)
    );
}

function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload  = () => resolve((r.result as string).split(',')[1]);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(blob);
    });
}

/** Yield to the browser so it can repaint before we crunch the next frame. */
const tick = () => new Promise<void>(r => requestAnimationFrame(() => r()));

// ── Widget ───────────────────────────────────────────────────────────────────

function buildDialog(fileName: string, origSize: number) {
    const overlay = document.createElement('div');
    overlay.className = 'compress-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'compress-dialog cde-window';

    /* title bar */
    const titlebar = document.createElement('div');
    titlebar.className = 'cde-titlebar';
    const icon = document.createElement('span');
    icon.className = 'cde-titlebar-icon';
    icon.textContent = '■';
    const title = document.createElement('span');
    title.className = 'cde-titlebar-title';
    title.textContent = 'Compressing Image';
    titlebar.appendChild(icon);
    titlebar.appendChild(title);
    dialog.appendChild(titlebar);

    /* body */
    const body = document.createElement('div');
    body.className = 'compress-body';

    const fileInfo = document.createElement('div');
    fileInfo.className = 'compress-file-info';
    fileInfo.textContent = `${fileName}  (${fmtBytes(origSize)} original)`;
    body.appendChild(fileInfo);

    /* attempts table header */
    const thead = document.createElement('div');
    thead.className = 'compress-thead';
    thead.innerHTML =
    '<span>Quality</span><span>Size</span><span>Target &lt; 5 MB</span>';
    body.appendChild(thead);

    /* attempts list */
    const list = document.createElement('div');
    list.className = 'compress-list';
    body.appendChild(list);

    /* status line */
    const status = document.createElement('div');
    status.className = 'compress-status';
    status.textContent = 'Loading image…';
    body.appendChild(status);

    dialog.appendChild(body);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    /* per-attempt rows created upfront */
    const rows = QUALITIES.map((q) => {
        const row = document.createElement('div');
        row.className = 'compress-row compress-row--pending';
    row.innerHTML = `
    <span class="cr-q">q = ${Math.round(q * 100)}%</span>
    <span class="cr-size">—</span>
    <span class="cr-state">·</span>
    `;
    list.appendChild(row);
    return row;
    });

    return {
        overlay,
        rows,
        status,
        setDimensions(w: number, h: number) {
            status.textContent = `${w} × ${h} px  —  converting to JPEG…`;
        },
        markRunning(i: number) {
            rows[i].className = 'compress-row compress-row--running';
            rows[i].querySelector('.cr-state')!.textContent = '⟳';
            rows[i].scrollIntoView({ block: 'nearest' });
        },
        markTooLarge(i: number, size: number) {
            rows[i].className = 'compress-row compress-row--toolarge';
            rows[i].querySelector('.cr-size')!.textContent  = fmtBytes(size);
            rows[i].querySelector('.cr-state')!.textContent = '✗';
        },
        markOk(i: number, size: number) {
            rows[i].className = 'compress-row compress-row--ok';
            rows[i].querySelector('.cr-size')!.textContent  = fmtBytes(size);
            rows[i].querySelector('.cr-state')!.textContent = '✓';
        },
        markWarn(i: number, size: number) {
            rows[i].className = 'compress-row compress-row--warn';
            rows[i].querySelector('.cr-size')!.textContent  = fmtBytes(size);
            rows[i].querySelector('.cr-state')!.textContent = '⚠';
        },
        setStatus(msg: string) {
            status.textContent = msg;
        },
    };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compress `file` to JPEG, showing a CDE progress dialog.
 * Resolves when a size < 5 MB is found (or all qualities exhausted).
 */
export async function compressWithDialog(file: File): Promise<CompressResult> {
    const ui = buildDialog(file.name, file.size);
    await tick();

    try {
        const bitmap = await createImageBitmap(file);
        const canvas  = document.createElement('canvas');
        canvas.width  = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
        bitmap.close();

        ui.setDimensions(canvas.width, canvas.height);
        await tick();

        let best: Blob | null  = null;
        let bestQuality = QUALITIES[QUALITIES.length - 1];

        for (let i = 0; i < QUALITIES.length; i++) {
            const q = QUALITIES[i];

            ui.markRunning(i);
            await tick();

            const blob = await canvasToBlob(canvas, q);
            best        = blob;
            bestQuality = q;

            if (blob.size <= MAX_BYTES) {
                ui.markOk(i, blob.size);
                ui.setStatus(`Done — ${fmtBytes(blob.size)} at q = ${Math.round(q * 100)}%`);
                await tick();
                break;
            }

            if (i < QUALITIES.length - 1) {
                ui.markTooLarge(i, blob.size);
            } else {
                ui.markWarn(i, blob.size);
                ui.setStatus(`⚠ Still ${fmtBytes(blob.size)} at minimum quality`);
            }
            await tick();
        }

        /* keep dialog visible briefly so the user can read the result */
        await new Promise(r => setTimeout(r, 800));
        ui.overlay.remove();

        const data = await blobToBase64(best!);
        return { data, mime: 'image/jpeg', size: best!.size, quality: bestQuality };

    } catch (err) {
        ui.overlay.remove();
        throw err;
    }
}
