import { session, scheduleSave } from '../state';
import type { Article, ArticleImage } from '../types';
import { nanoid, unixNow, fmtDate, esc, insertAtCursor, readFileB64 } from '../utils';

// ── Body renderer ────────────────────────────────────────────────────────────

/**
 * Render an article body to HTML.
 * Syntax:
 *   [[Title]]          → link to article
 *   {{img:ID|SCALE}}   → embedded image
 *   newlines           → <br> tags
 */
function renderBody(
  body: string,
  images: Record<string, ArticleImage>,
  onLink: (title: string) => void,
): HTMLElement {
  const out = document.createElement('div');
  out.className = 'art-preview-body';

  // Split on image and link markers
  const parts = body.split(/({{img:[^}]+}}|\[\[[^\]]+\]\])/g);

  let currentP = document.createElement('p');
  out.appendChild(currentP);

  const flushLine = () => {
    currentP = document.createElement('p');
    out.appendChild(currentP);
  };

  for (const part of parts) {
    const imgMatch = part.match(/^{{img:([^|]+)\|([^}]+)}}$/);
    if (imgMatch) {
      const [, id, scaleStr] = imgMatch;
      const scale = parseFloat(scaleStr) || 1.0;
      const img = images[id];
      if (img) {
        const el = document.createElement('img');
        el.src = `data:${img.mime};base64,${img.data}`;
        el.className = 'art-img';
        el.style.maxWidth = `${Math.round(scale * 100)}%`;
        el.title = `Scale: ${scale}`;
        flushLine();
        out.appendChild(el);
        flushLine();
      } else {
        const missing = document.createElement('span');
        missing.className = 'art-missing-img';
        missing.textContent = `[image not found: ${id}]`;
        currentP.appendChild(missing);
      }
      continue;
    }

    const linkMatch = part.match(/^\[\[(.+)\]\]$/);
    if (linkMatch) {
      const title = linkMatch[1];
      const span = document.createElement('span');
      span.className = 'art-link';
      span.textContent = title;
      span.addEventListener('click', () => onLink(title));
      currentP.appendChild(span);
      continue;
    }

    // Plain text — handle newlines
    const lines = part.split('\n');
    lines.forEach((line, i) => {
      if (i > 0) {
        out.appendChild(currentP);
        flushLine();
      }
      if (line) currentP.appendChild(document.createTextNode(line));
    });
  }

  return out;
}

// ── Main render ───────────────────────────────────────────────────────────────

export function renderArticles(container: HTMLElement): void {
  if (!session) return;
  const data = session.data;

  let selectedId: string | null = null;
  let editMode = true;
  let searchQuery = '';

  function getArticle(): Article | null {
    return selectedId ? data.articles.find(a => a.id === selectedId) ?? null : null;
  }

  function render() {
    container.innerHTML = '';
    container.className = 'art-root';

    // ── Left pane: article list ───────────────────────────────────────────
    const sidebar = document.createElement('div');
    sidebar.className = 'art-sidebar';
    container.appendChild(sidebar);

    const sideHead = document.createElement('div');
    sideHead.className = 'art-sidebar-head';

    const searchInput = document.createElement('input');
    searchInput.className = 'art-search';
    searchInput.type = 'text';
    searchInput.placeholder = 'Search…';
    searchInput.value = searchQuery;
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value;
      renderList();
    });

    const newBtn = document.createElement('button');
    newBtn.className = 'art-new-btn';
    newBtn.textContent = '+ New';
    newBtn.addEventListener('click', () => {
      const title = `Untitled ${data.articles.length + 1}`;
      const article: Article = {
        id: nanoid(),
        title,
        body: '',
        images: {},
        createdAt: unixNow(),
        updatedAt: unixNow(),
      };
      data.articles.push(article);
      selectedId = article.id;
      editMode = true;
      scheduleSave();
      render();
    });

    sideHead.appendChild(searchInput);
    sideHead.appendChild(newBtn);
    sidebar.appendChild(sideHead);

    const list = document.createElement('div');
    list.className = 'art-list';
    sidebar.appendChild(list);

    function renderList() {
      list.innerHTML = '';
      const q = searchQuery.toLowerCase();
      const filtered = q
        ? data.articles.filter(a => a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q))
        : data.articles;

      if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'art-empty';
        empty.textContent = q ? 'No matches' : 'No articles yet';
        list.appendChild(empty);
        return;
      }

      // Sort by updatedAt desc
      const sorted = [...filtered].sort((a, b) => b.updatedAt - a.updatedAt);
      sorted.forEach(art => {
        const item = document.createElement('div');
        item.className = 'art-list-item' + (art.id === selectedId ? ' active' : '');
        item.innerHTML = `
          <span class="art-list-title">${esc(art.title)}</span>
          <span class="art-list-date">${fmtDate(art.updatedAt)}</span>
        `;
        item.addEventListener('click', () => {
          selectedId = art.id;
          editMode = true;
          render();
        });
        list.appendChild(item);
      });
    }
    renderList();

    // ── Right pane: editor ────────────────────────────────────────────────
    const main = document.createElement('div');
    main.className = 'art-main';
    container.appendChild(main);

    const article = getArticle();
    if (!article) {
      const placeholder = document.createElement('div');
      placeholder.className = 'art-placeholder';
      placeholder.innerHTML = `
        <span class="art-placeholder-icon">◈</span>
        <p>Select an article or create a new one</p>
      `;
      main.appendChild(placeholder);
      return;
    }

    // Title
    const titleRow = document.createElement('div');
    titleRow.className = 'art-title-row';

    const titleInput = document.createElement('input');
    titleInput.className = 'art-title-input';
    titleInput.type = 'text';
    titleInput.value = article.title;
    titleInput.placeholder = 'Article title';
    titleInput.addEventListener('change', () => {
      const newTitle = titleInput.value.trim() || 'Untitled';
      // Check uniqueness
      const conflict = data.articles.find(a => a.id !== article.id && a.title === newTitle);
      if (conflict) {
        titleInput.value = article.title;
        return;
      }
      article.title = newTitle;
      article.updatedAt = unixNow();
      scheduleSave();
      renderList();
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'art-del-btn';
    delBtn.textContent = 'Delete';
    delBtn.title = 'Delete this article';
    delBtn.addEventListener('click', () => {
      if (!confirm(`Delete "${article.title}"?`)) return;
      const idx = data.articles.indexOf(article);
      if (idx >= 0) data.articles.splice(idx, 1);
      selectedId = null;
      scheduleSave();
      render();
    });

    titleRow.appendChild(titleInput);
    titleRow.appendChild(delBtn);
    main.appendChild(titleRow);

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'art-toolbar';

    const previewBtn = document.createElement('button');
    previewBtn.className = 'art-tool-btn' + (editMode ? '' : ' active');
    previewBtn.textContent = editMode ? 'Preview' : 'Edit';
    previewBtn.addEventListener('click', () => {
      editMode = !editMode;
      render();
    });

    const imgBtn = document.createElement('button');
    imgBtn.className = 'art-tool-btn';
    imgBtn.textContent = 'Insert image';

    const hiddenInput = document.createElement('input');
    hiddenInput.type = 'file';
    hiddenInput.accept = 'image/*';
    hiddenInput.style.display = 'none';
    hiddenInput.addEventListener('change', async () => {
      const file = hiddenInput.files?.[0];
      if (!file) return;
      try {
        const { data: b64, mime } = await readFileB64(file);
        const imgId = nanoid();
        const scaleStr = prompt('Image scale (0.1 – 2.0):', '1.0') || '1.0';
        const scale = Math.max(0.1, Math.min(2.0, parseFloat(scaleStr) || 1.0));
        article.images[imgId] = { data: b64, mime };
        if (editMode && textarea) {
          insertAtCursor(textarea, `{{img:${imgId}|${scale}}}`);
          article.body = textarea.value;
          article.updatedAt = unixNow();
          scheduleSave();
        }
      } catch {
        alert('Failed to load image');
      }
      hiddenInput.value = '';
    });

    imgBtn.addEventListener('click', () => imgBtn.isConnected && hiddenInput.click());

    toolbar.appendChild(previewBtn);
    if (editMode) toolbar.appendChild(imgBtn);
    toolbar.appendChild(hiddenInput);

    // Info text
    const infoSpan = document.createElement('span');
    infoSpan.className = 'art-toolbar-info';
    infoSpan.textContent = `Created ${fmtDate(article.createdAt)}`;
    toolbar.appendChild(infoSpan);
    main.appendChild(toolbar);

    // Editor / preview area
    let textarea: HTMLTextAreaElement | null = null;

    if (editMode) {
      textarea = document.createElement('textarea');
      textarea.className = 'art-editor';
      textarea.value = article.body;
      textarea.placeholder = 'Write your article…\n\nTip: [[Link to Article]] and {{img:id|1.0}}';
      textarea.spellcheck = false;
      textarea.addEventListener('input', () => {
        article.body = textarea!.value;
        article.updatedAt = unixNow();
        scheduleSave();
      });
      main.appendChild(textarea);
      setTimeout(() => textarea?.focus(), 50);
    } else {
      const preview = renderBody(article.body, article.images, (linkTitle) => {
        const target = data.articles.find(a => a.title === linkTitle);
        if (target) {
          selectedId = target.id;
          editMode = true;
          render();
        }
      });
      main.appendChild(preview);
    }
  }

  render();
}
