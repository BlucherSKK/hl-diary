// ─── Events ────────────────────────────────────────────────────────────────
export interface DiaryEvent {
    id: string;
    title: string;
    timestamp: number; // unix seconds
    color: string;     // hex e.g. "#7c6dff"
}

// ─── Articles ──────────────────────────────────────────────────────────────
/** Raw image data stored per-article. Scale lives in the body marker: {{img:ID|SCALE}} */
export interface ArticleImage {
    data: string; // base64, no "data:" prefix
    mime: string; // e.g. "image/png"
}

export interface Article {
    id: string;
    title: string;  // unique within a diary
    /** Plain text. Supports:
     *   [[Other Article Title]]  – link to another article
     *   {{img:ID|SCALE}}         – embedded image (scale = 0.1–2.0)
     */
    body: string;
    images: Record<string, ArticleImage>;
    createdAt: number;
    updatedAt: number;
}

// ─── Threads ───────────────────────────────────────────────────────────────
export interface MessageImage {
    data: string;
    mime: string;
    scale: number; // 0.1–2.0
}

export interface ThreadMessage {
    id: string;
    text: string;
    timestamp: number;
    image?: MessageImage;
}

export interface Thread {
    id: string;
    name: string;
    messages: ThreadMessage[];
    createdAt: number;
}

// ─── Root ──────────────────────────────────────────────────────────────────
export interface DiaryData {
    events: DiaryEvent[];
    articles: Article[];
    threads: Thread[];
}
