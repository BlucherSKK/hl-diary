import { session, scheduleSave } from '../state';
import type { Thread, ThreadMessage, MessageImage } from '../types';
import { nanoid, unixNow, fmtDateTime, fmtDate, esc, readFileB64 } from '../utils';

export function renderThreads(container: HTMLElement): void {
  if (!session) return;
  const data = session.data;

  let selectedId: string | null = null;
  let pendingImage: MessageImage | null = null;

  function getThread(): Thread | null {
    return selectedId ? data.threads.find(t => t.id === selectedId) ?? null : null;
  }

  function render() {
    container.innerHTML = '';
    container.className = 'thr-root';

    // ── Left sidebar: thread list ─────────────────────────────────────────
    const sidebar = document.createElement('div');
    sidebar.className = 'thr-sidebar';
    container.appendChild(sidebar);

    const sideHead = document.createElement('div');
    sideHead.className = 'thr-sidebar-head';
    sideHead.textContent = 'Threads';

    const newBtn = document.createElement('button');
    newBtn.className = 'thr-new-btn';
    newBtn.textContent = '+ New';
    newBtn.addEventListener('click', () => {
      const name = prompt('Thread name:')?.trim();
      if (!name) return;
      const thread: Thread = {
        id: nanoid(),
        name,
        messages: [],
        createdAt: unixNow(),
      };
      data.threads.push(thread);
      selectedId = thread.id;
      scheduleSave();
      render();
    });

    sideHead.appendChild(newBtn);
    sidebar.appendChild(sideHead);

    const list = document.createElement('div');
    list.className = 'thr-list';
    sidebar.appendChild(list);

    const sorted = [...data.threads].sort((a, b) => {
      const aLast = a.messages[a.messages.length - 1]?.timestamp ?? a.createdAt;
      const bLast = b.messages[b.messages.length - 1]?.timestamp ?? b.createdAt;
      return bLast - aLast;
    });

    if (sorted.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'thr-empty-list';
      empty.textContent = 'No threads yet';
      list.appendChild(empty);
    } else {
      sorted.forEach(t => {
        const item = document.createElement('div');
        item.className = 'thr-list-item' + (t.id === selectedId ? ' active' : '');

        const lastMsg = t.messages[t.messages.length - 1];
        item.innerHTML = `
          <div class="thr-item-name">${esc(t.name)}</div>
          <div class="thr-item-preview">${
            lastMsg ? esc(lastMsg.text.slice(0, 50) || '[image]') : 'Empty'
          }</div>
        `;
        item.addEventListener('click', () => {
          selectedId = t.id;
          pendingImage = null;
          render();
        });
        list.appendChild(item);
      });
    }

    // ── Right pane: messages ───────────────────────────────────────────────
    const main = document.createElement('div');
    main.className = 'thr-main';
    container.appendChild(main);

    const thread = getThread();
    if (!thread) {
      const ph = document.createElement('div');
      ph.className = 'thr-placeholder';
      ph.innerHTML = `
        <span class="thr-ph-icon">◈</span>
        <p>Select a thread or create a new one</p>
      `;
      main.appendChild(ph);
      return;
    }

    // Header
    const header = document.createElement('div');
    header.className = 'thr-header';
    header.innerHTML = `<span class="thr-header-name">${esc(thread.name)}</span>`;

    const delThreadBtn = document.createElement('button');
    delThreadBtn.className = 'thr-del-thread-btn';
    delThreadBtn.textContent = 'Delete thread';
    delThreadBtn.addEventListener('click', () => {
      if (!confirm(`Delete thread "${thread.name}"?`)) return;
      const idx = data.threads.indexOf(thread);
      if (idx >= 0) data.threads.splice(idx, 1);
      selectedId = null;
      scheduleSave();
      render();
    });
    header.appendChild(delThreadBtn);
    main.appendChild(header);

    // Messages area
    const msgs = document.createElement('div');
    msgs.className = 'thr-messages';
    main.appendChild(msgs);

    function renderMessages() {
      msgs.innerHTML = '';
      if (thread.messages.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'thr-msgs-empty';
        empty.textContent = 'No messages yet — send the first one!';
        msgs.appendChild(empty);
        return;
      }

      // Group by date
      let lastDateLabel = '';
      thread.messages.forEach(msg => {
        const dateLabel = fmtDate(msg.timestamp);
        if (dateLabel !== lastDateLabel) {
          const divider = document.createElement('div');
          divider.className = 'thr-date-divider';
          divider.textContent = dateLabel;
          msgs.appendChild(divider);
          lastDateLabel = dateLabel;
        }

        const bubble = document.createElement('div');
        bubble.className = 'thr-bubble';

        if (msg.text) {
          const textEl = document.createElement('div');
          textEl.className = 'thr-bubble-text';
          // Preserve newlines
          textEl.textContent = msg.text;
          bubble.appendChild(textEl);
        }

        if (msg.image) {
          const imgEl = document.createElement('img');
          imgEl.src = `data:${msg.image.mime};base64,${msg.image.data}`;
          imgEl.className = 'thr-bubble-img';
          imgEl.style.maxWidth = `${Math.round(msg.image.scale * 100)}%`;
          bubble.appendChild(imgEl);
        }

        const meta = document.createElement('div');
        meta.className = 'thr-bubble-meta';
        meta.textContent = fmtDateTime(msg.timestamp);

        const delBtn = document.createElement('button');
        delBtn.className = 'thr-del-msg';
        delBtn.textContent = '×';
        delBtn.title = 'Delete message';
        delBtn.addEventListener('click', () => {
          const idx = thread.messages.indexOf(msg);
          if (idx >= 0) thread.messages.splice(idx, 1);
          scheduleSave();
          renderMessages();
        });
        meta.appendChild(delBtn);
        bubble.appendChild(meta);
        msgs.appendChild(bubble);
      });

      // Scroll to bottom
      msgs.scrollTop = msgs.scrollHeight;
    }
    renderMessages();

    // Input bar
    const inputArea = document.createElement('div');
    inputArea.className = 'thr-input-area';
    main.appendChild(inputArea);

    // Image preview
    const imgPreview = document.createElement('div');
    imgPreview.className = 'thr-img-preview';
    imgPreview.style.display = 'none';
    inputArea.appendChild(imgPreview);

    function updateImgPreview() {
      if (!pendingImage) {
        imgPreview.style.display = 'none';
        imgPreview.innerHTML = '';
        return;
      }
      imgPreview.style.display = 'flex';
      imgPreview.innerHTML = '';

      const thumb = document.createElement('img');
      thumb.src = `data:${pendingImage.mime};base64,${pendingImage.data}`;
      thumb.className = 'thr-thumb';

      const sliderWrap = document.createElement('div');
      sliderWrap.className = 'thr-slider-wrap';

      const sliderLabel = document.createElement('label');
      sliderLabel.textContent = `Scale: ${pendingImage.scale.toFixed(1)}`;

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0.1';
      slider.max = '2.0';
      slider.step = '0.1';
      slider.value = String(pendingImage.scale);
      slider.addEventListener('input', () => {
        if (pendingImage) {
          pendingImage.scale = parseFloat(slider.value);
          sliderLabel.textContent = `Scale: ${pendingImage.scale.toFixed(1)}`;
        }
      });

      const clearBtn = document.createElement('button');
      clearBtn.className = 'thr-clear-img';
      clearBtn.textContent = '× Remove';
      clearBtn.addEventListener('click', () => {
        pendingImage = null;
        updateImgPreview();
      });

      sliderWrap.appendChild(sliderLabel);
      sliderWrap.appendChild(slider);
      sliderWrap.appendChild(clearBtn);
      imgPreview.appendChild(thumb);
      imgPreview.appendChild(sliderWrap);
    }

    // Compose row
    const compose = document.createElement('div');
    compose.className = 'thr-compose';
    inputArea.appendChild(compose);

    const textarea = document.createElement('textarea');
    textarea.className = 'thr-textarea';
    textarea.placeholder = 'Write a message…';
    textarea.rows = 1;
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    });
    textarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
      }
    });

    const attachBtn = document.createElement('button');
    attachBtn.className = 'thr-attach-btn';
    attachBtn.textContent = '📎';
    attachBtn.title = 'Attach image';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const { data: b64, mime } = await readFileB64(file);
        pendingImage = { data: b64, mime, scale: 1.0 };
        updateImgPreview();
      } catch {
        alert('Failed to load image');
      }
      fileInput.value = '';
    });
    attachBtn.addEventListener('click', () => fileInput.click());

    const sendBtn = document.createElement('button');
    sendBtn.className = 'thr-send-btn';
    sendBtn.textContent = 'Send';
    sendBtn.addEventListener('click', () => {
      const text = textarea.value.trim();
      if (!text && !pendingImage) return;

      const msg: ThreadMessage = {
        id: nanoid(),
        text,
        timestamp: unixNow(),
        image: pendingImage ?? undefined,
      };
      thread.messages.push(msg);
      scheduleSave();

      textarea.value = '';
      textarea.style.height = 'auto';
      pendingImage = null;
      updateImgPreview();
      renderMessages();
    });

    compose.appendChild(textarea);
    compose.appendChild(fileInput);
    compose.appendChild(attachBtn);
    compose.appendChild(sendBtn);
  }

  render();
}
