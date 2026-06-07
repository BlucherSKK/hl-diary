import type { Session } from './state';
import { clearSession, onSaveStatus, doSave, type SaveStatus } from './state';
import { renderCalendar } from './views/calendar';
import { renderArticles } from './views/articles';
import { renderThreads } from './views/threads';
import { rep } from './languge';

type View = 'calendar' | 'articles' | 'threads';

export function startApp(container: HTMLElement, session: Session): void {
  container.innerHTML = '';
  container.className = 'app-root';

  let currentView: View = 'calendar';

  // ── Sidebar ─────────────────────────────────────────────────────────────
  const sidebar = document.createElement('aside');
  sidebar.className = 'app-sidebar';
  container.appendChild(sidebar);

  // Brand
  const brand = document.createElement('div');
  brand.className = 'app-brand';
  brand.innerHTML = `<span class="app-brand-icon">◈</span><span>Diary</span>`;
  sidebar.appendChild(brand);

  // User
  const userEl = document.createElement('div');
  userEl.className = 'app-user';
  userEl.textContent = session.username;
  sidebar.appendChild(userEl);

  // Navigation
  const nav = document.createElement('nav');
  nav.className = 'app-nav';
  sidebar.appendChild(nav);

  const NAV_ITEMS: { id: View; label: string; icon: string }[] = [
    { id: 'calendar', label: rep('celendar'),  icon: '◷' },
    { id: 'articles', label: rep('articles'),  icon: '◫' },
    { id: 'threads',  label: rep('threads'),   icon: '◱' },
  ];

  function setView(v: View) {
    currentView = v;
    nav.querySelectorAll<HTMLButtonElement>('.app-nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === v);
    });
    renderView();
  }

  NAV_ITEMS.forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'app-nav-btn' + (item.id === currentView ? ' active' : '');
    btn.dataset.view = item.id;
    btn.innerHTML = `<span class="nav-icon">${item.icon}</span><span>${item.label}</span>`;
    btn.addEventListener('click', () => setView(item.id));
    nav.appendChild(btn);
  });

  // Spacer
  const spacer = document.createElement('div');
  spacer.style.flex = '1';
  sidebar.appendChild(spacer);

  // Save status
  const saveStatus = document.createElement('div');
  saveStatus.className = 'app-save-status';
  saveStatus.textContent = '';
  sidebar.appendChild(saveStatus);

  const statusText: Record<SaveStatus, string> = {
    idle:    '',
    pending: '● unsaved',
    saving:  '⟳ saving…',
    saved:   '✓ saved',
    error:   '✗ error',
  };
  const statusClass: Record<SaveStatus, string> = {
    idle:    '',
    pending: 'status-pending',
    saving:  'status-saving',
    saved:   'status-saved',
    error:   'status-error',
  };

  const offStatus = onSaveStatus((s, msg) => {
    saveStatus.textContent = statusText[s] + (msg && s === 'error' ? `: ${msg}` : '');
    saveStatus.className = 'app-save-status ' + statusClass[s];
  });

  // Logout
  const logoutBtn = document.createElement('button');
  logoutBtn.className = 'app-logout-btn';
  logoutBtn.textContent = 'Log out';
  logoutBtn.addEventListener('click', async () => {
    await doSave().catch(() => {});
    offStatus();
    clearSession();
    // Reload to show login
    location.reload();
  });
  sidebar.appendChild(logoutBtn);

  // ── Main content area ────────────────────────────────────────────────────
  const main = document.createElement('main');
  main.className = 'app-main';
  container.appendChild(main);

  function renderView() {
    main.innerHTML = '';
    if (currentView === 'calendar') renderCalendar(main);
    else if (currentView === 'articles') renderArticles(main);
    else if (currentView === 'threads') renderThreads(main);
  }

  renderView();
}
