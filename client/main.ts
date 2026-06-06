import { session } from './state';
import { renderLogin } from './views/login';
import { startApp } from './app';

function boot() {
  const root = document.getElementById('app');
  if (!root) return;

  if (session) {
    startApp(root, session);
  } else {
    renderLogin(root, (s) => {
      startApp(root, s);
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
