import { session, scheduleSave } from '../state';
import type { Article, ArticleImage } from '../types';
import { nanoid, unixNow, fmtDate, esc, insertAtCursor } from '../utils';
import { compressWithDialog } from '../compress';
import { rep } from '../languge';

// ── Inline processor (links + inline images within a single line) ────────────

function processInline(
  text: string,
  parent: HTMLElement,
  images: Record<string, ArticleImage>,
  onLink: (t: string) => void,
) {
  const parts = text.split(/({{img:[^}]+}}|\[\[[^\]]+\]\])/g);
  for (const part of parts) {
    const lm = part.match(/^\[\[(.+)\]\]$/);
    if (lm) {
      const span = document.createElement('span');
      span.className = 'art-link';
      span.textContent = lm[1];
      span.addEventListener('click', () => onLink(lm[1]));
      parent.appendChild(span);
      continue;
    }
    const im = part.match(/^{{img:([^|]+)\|([^}]+)}}$/);
    if (im) {
      const img = images[im[1]];
      if (img) {
        const el = document.createElement('img');
        el.src = `data:${img.mime};base64,${img.data}`;
        el.className = 'art-img';
        el.style.maxWidth = `${Math.round((parseFloat(im[2]) || 1) * 100)}%`;
        parent.appendChild(el);
      }
      continue;
    }
    parent.appendChild(document.createTextNode(part));
    }
    }

    // ── Body renderer ─────────────────────────────────────────────────────────────
    //
    //  # H1   ## H2   ### H3   (Markdown-style headings, line must start with #)
    //  {{img:ID|SCALE}}         standalone image (whole line)
    //  [[Title]]                link to another article
    //  everything else          plain text, newlines preserved via pre-wrap

    function renderBody(
      body: string,
      images: Record<string, ArticleImage>,
      onLink: (title: string) => void,
    ): HTMLElement {
      const out = document.createElement('div');
      out.className = 'art-preview-body';

      const lines = body.split('\n');
      let textBlock: HTMLDivElement | null = null;

      function flushText() {
        if (textBlock) { out.appendChild(textBlock); textBlock = null; }
      }

      function getTextBlock(): HTMLDivElement {
        if (!textBlock) {
          textBlock = document.createElement('div');
          textBlock.className = 'art-text-block';
        }
        return textBlock;
      }

      lines.forEach((line, idx) => {
        const isLast = idx === lines.length - 1;

        // Heading
        const hm = line.match(/^(#{1,3}) (.*)$/);
        if (hm) {
          flushText();
          const level = hm[1].length as 1 | 2 | 3;
          const el = document.createElement(`h${level}`) as HTMLHeadingElement;
          el.className = `art-h${level}`;
          processInline(hm[2], el, images, onLink);
          out.appendChild(el);
          return;
        }

        // Standalone image (entire line is {{img:...}})
        const imgm = line.match(/^{{img:([^|]+)\|([^}]+)}}$/);
        if (imgm) {
          flushText();
          const img = images[imgm[1]];
          if (img) {
            const el = document.createElement('img');
            el.src = `data:${img.mime};base64,${img.data}`;
            el.className = 'art-img';
            el.style.maxWidth = `${Math.round((parseFloat(imgm[2]) || 1) * 100)}%`;
            out.appendChild(el);
          } else {
            const miss = document.createElement('span');
            miss.className = 'art-missing-img';
            miss.textContent = `[image not found: ${imgm[1]}]`;
            getTextBlock().appendChild(miss);
            if (!isLast) getTextBlock().appendChild(document.createTextNode('\n'));
          }
          return;
        }

        // Plain text line — stays in text block (pre-wrap preserves spacing)
        const tb = getTextBlock();
        processInline(line, tb, images, onLink);
        if (!isLast) tb.appendChild(document.createTextNode('\n'));
    });

      flushText();
      return out;
      }

      // ── Main render ───────────────────────────────────────────────────────────────

      export function renderArticles(container: HTMLElement): void {
        if (!session) return;
        const data = session.data;

        let selectedId: string | null = null;
        let editMode   = false;           // default: preview
        let searchQuery = '';

        function getArticle(): Article | null {
          return selectedId ? data.articles.find(a => a.id === selectedId) ?? null : null;
        }

        function render() {
          container.innerHTML = '';
          container.className = 'art-root';

          // ── Sidebar ─────────────────────────────────────────────────────────────
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
          searchInput.addEventListener('input', () => { searchQuery = searchInput.value; renderList(); });

          const newBtn = document.createElement('button');
          newBtn.className = 'art-new-btn';
          newBtn.textContent = '+ New';
          newBtn.addEventListener('click', () => {
            const article: Article = {
              id: nanoid(), title: `${rep('untitled')} ${data.articles.length + 1}`,
                                  body: '', images: {}, createdAt: unixNow(), updatedAt: unixNow(),
            };
            data.articles.push(article);
            selectedId = article.id;
            editMode   = true;          // new article opens in edit mode
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

            [...filtered].sort((a, b) => b.updatedAt - a.updatedAt).forEach(art => {
              const item = document.createElement('div');
              item.className = 'art-list-item' + (art.id === selectedId ? ' active' : '');
              item.innerHTML = `
              <span class="art-list-title">${esc(art.title)}</span>
              <span class="art-list-date">${fmtDate(art.updatedAt)}</span>
              `;
              item.addEventListener('click', () => {
                selectedId = art.id;
                editMode   = false;     // always open in preview
                render();
              });
              list.appendChild(item);
            });
          }
          renderList();

          // ── Main area ────────────────────────────────────────────────────────────
          const main = document.createElement('div');
          main.className = 'art-main';
          container.appendChild(main);

          const article = getArticle();
          if (!article) {
            const ph = document.createElement('div');
            ph.className = 'art-placeholder';
            ph.innerHTML = `<span class="art-placeholder-icon">◈</span><p>Select an article or create a new one</p>`;
            main.appendChild(ph);
            return;
          }

          // ── Title row ────────────────────────────────────────────────────────────
          const titleRow = document.createElement('div');
          titleRow.className = 'art-title-row';

          const titleInput = document.createElement('input');
          titleInput.className = 'art-title-input';
          titleInput.type = 'text';
          titleInput.value = article.title;
          titleInput.placeholder = 'Article title';
          titleInput.readOnly = !editMode;
          if (!editMode) titleInput.style.pointerEvents = 'none';

          const delBtn = document.createElement('button');
          delBtn.className = 'art-del-btn';
          delBtn.textContent = 'Delete';
          delBtn.addEventListener('click', () => {
            if (!confirm(`Delete "${article.title}"?`)) return;
            data.articles.splice(data.articles.indexOf(article), 1);
            selectedId = null;
            editMode   = false;
            scheduleSave();
            render();
          });

          titleRow.appendChild(titleInput);
          titleRow.appendChild(delBtn);
          main.appendChild(titleRow);

          // ── Toolbar ──────────────────────────────────────────────────────────────
          const toolbar = document.createElement('div');
          toolbar.className = 'art-toolbar';

          const infoSpan = document.createElement('span');
          infoSpan.className = 'art-toolbar-info';
          infoSpan.textContent = `Created ${fmtDate(article.createdAt)}`;

          if (editMode) {
            // Save button
            const saveBtn = document.createElement('button');
            saveBtn.className = 'art-tool-btn art-save-btn';
            saveBtn.textContent = 'Save';
            saveBtn.addEventListener('click', () => {
              const newTitle = titleInput.value.trim() || 'Untitled';
              // Check title uniqueness
              const conflict = data.articles.find(a => a.id !== article.id && a.title === newTitle);
              if (conflict) {
                titleInput.value = article.title;
                titleInput.focus();
                return;
              }
              article.title     = newTitle;
              article.body      = (textarea?.value ?? article.body);
              article.updatedAt = unixNow();
              editMode          = false;
              scheduleSave();
              render();
            });

            // Cancel button
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'art-tool-btn';
            cancelBtn.textContent = 'Cancel';
            cancelBtn.addEventListener('click', () => {
              titleInput.value = article.title;
              editMode = false;
              render();
            });

            toolbar.appendChild(saveBtn);
            toolbar.appendChild(cancelBtn);
          } else {
            // Edit button
            const editBtn = document.createElement('button');
            editBtn.className = 'art-tool-btn';
            editBtn.textContent = 'Edit';
            editBtn.addEventListener('click', () => {
              editMode = true;
              render();
            });
            toolbar.appendChild(editBtn);
          }

          toolbar.appendChild(infoSpan);
          main.appendChild(toolbar);

          // ── Editor / Preview ─────────────────────────────────────────────────────
          let textarea: HTMLTextAreaElement | null = null;

          if (editMode) {
            const editorWrap = document.createElement('div');
            editorWrap.className = 'art-editor-wrap';

            const dropOverlay = document.createElement('div');
            dropOverlay.className = 'art-editor-drop-overlay';
            dropOverlay.textContent = '↓ Drop image here';
            editorWrap.appendChild(dropOverlay);

            textarea = document.createElement('textarea');
            textarea.className = 'art-editor';
            textarea.value = article.body;
            textarea.placeholder =
            'Write your article…\n\n# Heading 1\n## Heading 2\n### Heading 3\n[[Link to Article]]\n{{img:id|1.0}}\n\nDrag & drop an image to embed it.';
            textarea.spellcheck = false;
            // No auto-save — Save button commits

            // Ctrl+S / Cmd+S → Save
            textarea.addEventListener('keydown', e => {
              if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                toolbar.querySelector<HTMLButtonElement>('.art-save-btn')?.click();
              }
            });

            // Drag & drop
            async function insertDroppedImage(file: File) {
              try {
                const result = await compressWithDialog(file);
                const imgId  = nanoid();
                const scaleStr = prompt('Image scale (0.1 – 2.0):', '1.0') || '1.0';
                const scale  = Math.max(0.1, Math.min(2.0, parseFloat(scaleStr) || 1.0));
                article.images[imgId] = { data: result.data, mime: result.mime };
                insertAtCursor(textarea!, `{{img:${imgId}|${scale}}}`);
                // body committed on Save, not here
              } catch {
                alert('Failed to process image');
              }
            }

            textarea.addEventListener('dragover', e => {
              if (!Array.from(e.dataTransfer?.items || []).some(i => i.kind === 'file' && i.type.startsWith('image/'))) return;
              e.preventDefault();
              editorWrap.classList.add('drop-active');
            });
            textarea.addEventListener('dragleave', e => {
              if (!editorWrap.contains(e.relatedTarget as Node)) editorWrap.classList.remove('drop-active');
            });
              textarea.addEventListener('drop', async e => {
                e.preventDefault();
                editorWrap.classList.remove('drop-active');
                const file = Array.from(e.dataTransfer?.files || []).find(f => f.type.startsWith('image/'));
                if (file) await insertDroppedImage(file);
              });

                editorWrap.appendChild(textarea);
                main.appendChild(editorWrap);
                setTimeout(() => textarea?.focus(), 50);

          } else {
            // Preview
            const preview = renderBody(article.body, article.images, (linkTitle) => {
              const target = data.articles.find(a => a.title === linkTitle);
              if (target) { selectedId = target.id; editMode = false; render(); }
            });
            main.appendChild(preview);
          }
        }

        render();
      }
