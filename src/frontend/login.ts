function setSessionCookie(token: string): void {
  document.cookie =
    'rdb_session=' +
    encodeURIComponent(token) +
    '; path=/; samesite=strict; max-age=86400';
}

function showError(id: string, message: string): void {
  const el = document.getElementById(id)!;
  el.textContent = message;
  el.classList.remove('d-none');
}

function hideError(id: string): void {
  document.getElementById(id)!.classList.add('d-none');
}

document
  .getElementById('login-form')!
  .addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('login-error');
    const username = (
      document.getElementById('login-username') as HTMLInputElement
    ).value;
    const password = (
      document.getElementById('login-password') as HTMLInputElement
    ).value;
    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      let data: any;
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      if (!res.ok) {
        showError('login-error', data.error || `Server error (${res.status})`);
        return;
      }
      setSessionCookie(data.token);
      const params = new URLSearchParams(window.location.search);
      window.location.href = params.get('next') || '/';
    } catch {
      showError('login-error', 'Network error. Please try again.');
    }
  });

document
  .getElementById('register-form')!
  .addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('register-error');
    document.getElementById('register-success')!.classList.add('d-none');
    const username = (
      document.getElementById('reg-username') as HTMLInputElement
    ).value;
    const email = (
      document.getElementById('reg-email') as HTMLInputElement
    ).value;
    const password = (
      document.getElementById('reg-password') as HTMLInputElement
    ).value;
    try {
      const res = await fetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });
      const data = await res.json();
      if (!res.ok) {
        showError('register-error', data.error || 'Registration failed');
        return;
      }
      const successEl = document.getElementById('register-success')!;
      successEl.textContent = 'Account created! You can now sign in.';
      successEl.classList.remove('d-none');
      (document.getElementById('login-tab') as HTMLButtonElement).click();
      (document.getElementById('login-username') as HTMLInputElement).value =
        username;
    } catch {
      showError('register-error', 'Network error. Please try again.');
    }
  });
