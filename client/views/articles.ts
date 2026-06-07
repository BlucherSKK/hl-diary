import { session, scheduleSave } from '../state';
import type { Article, ArticleImage } from '../types';
import { nanoid, unixNow, fmtDate, esc, insertAtCursor } from '../utils';
import { compressWithDialog } from '../compress';

// ── Inline processor ──────────────────────────────────────────────────────────
//
//  Supports: **bold**  __bold__  *italic*  _italic_  `code`  ~~strike~~
//            [[wiki link]]  {{img:ID|SCALE}}

function processInline(
  text: string,
  parent: HTMLElement,
  images: Record<string, ArticleImage>,
  onLink: (t: string) => void,
) {
  // Ordered so longer/greedier patterns come first (** before *)
  const re = /({{img:[^|]+\|[^}]+}}|\[\[[^\]]+\]\]|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    // Text before this match
    if (m.index > last) {
      parent.appendChild(document.createTextNode(text.slice(last, m.index)));
    }

    const tok = m[1];

    // {{img:ID|SCALE}}
    const imgM = tok.match(/^{{img:([^|]+)\|([^}]+)}}$/);
    if (imgM) {
      const img = images[imgM[1]];
      if (img) {
        const el = document.createElement('img');
        el.src = `data:${img.mime};base64,${img.data}`;
        el.className = 'art-img';
        el.style.maxWidth = `${Math.round((parseFloat(imgM[2]) || 1) * 100)}%`;
        parent.appendChild(el);
      } else {
        const miss = document.createElement('span');
        miss.className = 'art-missing-img';
        miss.textContent = `[image not found: ${imgM[1]}]`;
        parent.appendChild(miss);
      }
      last = re.lastIndex;
      continue;
    }

    // [[wiki link]]
    const linkM = tok.match(/^\[\[(.+)\]\]$/);
    if (linkM) {
      const span = document.createElement('span');
      span.className = 'art-link';
      span.textContent = linkM[1];
      span.addEventListener('click', () => onLink(linkM[1]));
      parent.appendChild(span);
      last = re.lastIndex;
      continue;
    }

    // **bold** or __bold__
    if ((tok.startsWith('**') && tok.endsWith('**')) ||
      (tok.startsWith('__') && tok.endsWith('__'))) {
      const el = document.createElement('strong');
    el.textContent = tok.slice(2, -2);
    parent.appendChild(el);
    last = re.lastIndex;
    continue;
      }

      // ~~strikethrough~~
      if (tok.startsWith('~~') && tok.endsWith('~~')) {
        const el = document.createElement('del');
        el.textContent = tok.slice(2, -2);
        parent.appendChild(el);
        last = re.lastIndex;
        continue;
      }

      // *italic* or _italic_
      if ((tok.startsWith('*') && tok.endsWith('*')) ||
        (tok.startsWith('_') && tok.endsWith('_'))) {
        const el = document.createElement('em');
      el.textContent = tok.slice(1, -1);
      parent.appendChild(el);
      last = re.lastIndex;
      continue;
        }

        // `inline code`
        if (tok.startsWith('`') && tok.endsWith('`')) {
          const el = document.createElement('code');
          el.className = 'art-inline-code';
          el.textContent = tok.slice(1, -1);
          parent.appendChild(el);
          last = re.lastIndex;
          continue;
        }

        // Fallback — append as-is
        parent.appendChild(document.createTextNode(tok));
        last = re.lastIndex;
        }

        // Remaining text after last match
        if (last < text.length) {
          parent.appendChild(document.createTextNode(text.slice(last)));
        }
        }

        // ── Body renderer ─────────────────────────────────────────────────────────────
        //
        //  # H1   ## H2   ### H3      (headings)
        //  **bold**  *italic*          (inline formatting)
        //  `code`   ~~strike~~         (inline formatting)
        //  - item  / * item            (bullet list)
        //  ---  /  ***  /  ___         (horizontal rule)
        //  {{img:ID|SCALE}}            (standalone image)
        //  [[Title]]                   (wiki link to another article)
        //  everything else             (plain text, newlines preserved via pre-wrap)

        function renderBody(
          body: string,
          images: Record<string, ArticleImage>,
          onLink: (title: string) => void,
        ): HTMLElement {
          // Safety: old articles may have been saved without the images field
          const imgs: Record<string, ArticleImage> = images ?? {};

          const out = document.createElement('div');
          out.className = 'art-preview-body';

          const lines = body.split('\n').map(l => l.endsWith('\r') ? l.slice(0, -1) : l);

          let textBlock: HTMLDivElement | null = null;
          let listEl: HTMLUListElement | null = null;

          function flushText() {
            if (textBlock) { out.appendChild(textBlock); textBlock = null; }
          }
          function flushList() {
            if (listEl) { out.appendChild(listEl); listEl = null; }
          }
          function flushAll() { flushText(); flushList(); }

          function getTextBlock(): HTMLDivElement {
            flushList();
            if (!textBlock) {
              textBlock = document.createElement('div');
              textBlock.className = 'art-text-block';
            }
            return textBlock;
          }

          function getList(): HTMLUListElement {
            flushText();
            if (!listEl) {
              listEl = document.createElement('ul');
              listEl.className = 'art-ul';
            }
            return listEl;
          }

          lines.forEach((line, idx) => {
            const isLast = idx === lines.length - 1;

            // ── Heading  # / ## / ###
            const hm = line.match(/^(#{1,3}) (.*)$/);
            if (hm) {
              flushAll();
              const level = hm[1].length as 1 | 2 | 3;
              const el = document.createElement(`h${level}`) as HTMLHeadingElement;
              el.className = `art-h${level}`;
              processInline(hm[2], el, imgs, onLink);
              out.appendChild(el);
              return;
            }

            // ── Horizontal rule  --- / *** / ___
            if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
              flushAll();
              const hr = document.createElement('hr');
              hr.className = 'art-hr';
              out.appendChild(hr);
              return;
            }

            // ── Bullet list item  - text  /  * text
            const bm = line.match(/^[-*] (.*)$/);
            if (bm) {
              const ul = getList();
              const li = document.createElement('li');
              li.className = 'art-li';
              processInline(bm[1], li, imgs, onLink);
              ul.appendChild(li);
              return;
            }

            // ── Standalone image  {{img:ID|SCALE}}
            const imgm = line.match(/^{{img:([^|]+)\|([^}]+)}}$/);
            if (imgm) {
              flushAll();
              const img = imgs[imgm[1]];
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

            // ── Plain text line (pre-wrap preserves spacing / newlines)
            const tb = getTextBlock();
            processInline(line, tb, imgs, onLink);
            if (!isLast) tb.appendChild(document.createTextNode('\n'));
        });

          flushAll();
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
                  id: nanoid(), title: `Untitled ${data.articles.length + 1}`,
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

              // Migration: old saved articles may lack the images field
              if (!article.images) article.images = {};

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

              // textarea reference needed in save handler
              let textarea: HTMLTextAreaElement | null = null;

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
                  article.body      = textarea?.value ?? article.body;
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
                'Write your article…\n\n# Heading 1\n## Heading 2\n### Heading 3\n**bold**  *italic*  `code`  ~~strike~~\n- bullet item\n---\n[[Link to Article]]\n{{img:id|1.0}}\n\nDrag & drop an image to embed it.';
                textarea.spellcheck = false;
                // No auto-save — Save button commits

                // Ctrl+S / Cmd+S → Save
                textarea.addEventListener('keydown', e => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault();
                    toolbar.querySelector<HTMLButtonElement>('.art-save-btn')?.click();
                  }
                });

                // Drag & drop image
                async function insertDroppedImage(file: File) {
                  try {
                    const result = await compressWithDialog(file);
                    const imgId  = nanoid();
                    const scaleStr = prompt('Image scale (0.1 – 2.0):', '1.0') || '1.0';
                    const scale  = Math.max(0.1, Math.min(2.0, parseFloat(scaleStr) || 1.0));
                    // Ensure images object exists (migration for old articles)
                    if (!article.images) article.images = {};
                    article.images[imgId] = { data: result.data, mime: result.mime };
                    insertAtCursor(textarea!, `{{img:${imgId}|${scale}}}`);
                    // Commit body + images immediately so data isn't lost if page closes
                    article.body      = textarea!.value;
                    article.updatedAt = unixNow();
                    scheduleSave();
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
