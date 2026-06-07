import type { Session } from '../state';
import { setSession } from '../state';
import { apiCreate, apiRead } from '../api';
import { decryptDiary, encryptDiary, generateWriteKey } from '../crypto';
import type { DiaryData } from '../types';

type LoginCallback = (session: Session) => void;

export function renderLogin(container: HTMLElement, onLogin: LoginCallback): void {
  container.innerHTML = '';
  container.className = 'login-page';

  const card = document.createElement('div');
  card.className = 'login-card';
  card.innerHTML = `
  <div class="login-logo">
  <span class="login-logo-icon">◈</span>
  <h1>Diary</h1>
  <p class="login-subtitle">encrypted personal journal</p>
  </div>

  <div class="login-tabs">
  <button class="tab-btn tab-open active" data-tab="open">Open</button>
  <button class="tab-btn tab-create" data-tab="create">New</button>
  </div>

  <div class="login-form" id="login-form-open">
  <div class="field">
  <label>Username</label>
  <input id="open-user" type="text" placeholder="your_diary" autocomplete="username" spellcheck="false" />
  </div>
  <div class="field">
  <label>Password</label>
  <input id="open-pass" type="password" placeholder="••••••••" autocomplete="current-password" />
  </div>
  <div class="login-error" id="open-error"></div>
  <button class="login-btn" id="open-submit">Open diary</button>
  </div>

  <div class="login-form hidden" id="login-form-create">
  <div class="field">
  <label>Username</label>
  <input id="create-user" type="text" placeholder="new_diary" autocomplete="username" spellcheck="false" />
  </div>
  <div class="field">
  <label>Password</label>
  <input id="create-pass" type="password" placeholder="••••••••" autocomplete="new-password" />
  </div>
  <div class="field">
  <label>Confirm password</label>
  <input id="create-pass2" type="password" placeholder="••••••••" autocomplete="new-password" />
  </div>
  <div class="login-error" id="create-error"></div>
  <button class="login-btn" id="create-submit">Create diary</button>
  </div>
  `;
  container.appendChild(card);

  // Tab switching
  const tabs = card.querySelectorAll<HTMLButtonElement>('.tab-btn');
  const formOpen   = card.querySelector<HTMLElement>('#login-form-open')!;
  const formCreate = card.querySelector<HTMLElement>('#login-form-create')!;

  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (btn.dataset.tab === 'open') {
        formOpen.classList.remove('hidden');
        formCreate.classList.add('hidden');
      } else {
        formOpen.classList.add('hidden');
        formCreate.classList.remove('hidden');
      }
    });
  });

  // ── Open diary ───────────────────────────────────────────────────────────
  const openUser   = card.querySelector<HTMLInputElement>('#open-user')!;
  const openPass   = card.querySelector<HTMLInputElement>('#open-pass')!;
  const openErr    = card.querySelector<HTMLElement>('#open-error')!;
  const openSubmit = card.querySelector<HTMLButtonElement>('#open-submit')!;

  function setLoading(btn: HTMLButtonElement, loading: boolean, label: string) {
    btn.disabled = loading;
    btn.textContent = loading ? 'Please wait…' : label;
  }

  async function doOpen() {
    const username = openUser.value.trim();
    const password = openPass.value;
    openErr.textContent = '';
    if (!username) { openErr.textContent = 'Enter a username'; return; }
    if (!password)  { openErr.textContent = 'Enter a password';  return; }

    setLoading(openSubmit, true, 'Open diary');
    try {
      // GET /api/diary/:username already strips the 128-byte write-key prefix,
      // returning only the encrypted blob [salt(16)|iv(12)|ciphertext].
      const encBlob = await apiRead(username);
      const { writeKey, data } = await decryptDiary(encBlob, password);
      const session: Session = { username, writeKey, password, data };
      setSession(session);
      onLogin(session);
    } catch (e) {
      openErr.textContent = (e as Error).message || 'Failed to open diary';
    } finally {
      setLoading(openSubmit, false, 'Open diary');
    }
  }

  openSubmit.addEventListener('click', doOpen);
  openPass.addEventListener('keydown', e => { if (e.key === 'Enter') doOpen(); });
  openUser.addEventListener('keydown', e => { if (e.key === 'Enter') openPass.focus(); });

  // ── Create diary ──────────────────────────────────────────────────────────
  const createUser   = card.querySelector<HTMLInputElement>('#create-user')!;
  const createPass   = card.querySelector<HTMLInputElement>('#create-pass')!;
  const createPass2  = card.querySelector<HTMLInputElement>('#create-pass2')!;
  const createErr    = card.querySelector<HTMLElement>('#create-error')!;
  const createSubmit = card.querySelector<HTMLButtonElement>('#create-submit')!;

  async function doCreate() {
    const username = createUser.value.trim();
    const password = createPass.value;
    const confirm  = createPass2.value;
    createErr.textContent = '';

    if (!username) { createErr.textContent = 'Enter a username'; return; }
    if (!/^[a-z0-9_-]{1,32}$/.test(username)) {
      createErr.textContent = 'Letters, digits, _ and - only (max 32 chars)';
      return;
    }
    if (!password)         { createErr.textContent = 'Enter a password';      return; }
    if (password.length < 4) { createErr.textContent = 'Password too short';   return; }
    if (password !== confirm) { createErr.textContent = 'Passwords do not match'; return; }

    setLoading(createSubmit, true, 'Create diary');
    try {
      const writeKey = generateWriteKey();
      const data: DiaryData = { events: [], articles: [], threads: [] };
      const encBlob = await encryptDiary(writeKey, data, password);
      await apiCreate(username, writeKey, encBlob);
      const session: Session = { username, writeKey, password, data };
      setSession(session);
      onLogin(session);
    } catch (e) {
      createErr.textContent = (e as Error).message || 'Failed to create diary';
    } finally {
      setLoading(createSubmit, false, 'Create diary');
    }
  }

  createSubmit.addEventListener('click', doCreate);
  createPass2.addEventListener('keydown', e => { if (e.key === 'Enter') doCreate(); });

  // Focus first field
  setTimeout(() => openUser.focus(), 50);
}
