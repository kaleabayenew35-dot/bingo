const authElements = {
  username: document.getElementById('authUsername'),
  phone: document.getElementById('authPhone'),
  balance: document.getElementById('authBalance'),
  token: document.getElementById('authTokenValue'),
  dashboardUsername: document.getElementById('dashboardUsername'),
  dashboardBalance: document.getElementById('dashboardBalance'),
  avatarInitial: document.getElementById('avatarInitial'),
};

const sampleUsers = [
  {
    username: 'BingoBot',
    phone: '+1234567890',
    balance: 312,
    token: 'abc123-token',
    url: 'http://localhost:3000/?token=abc123-token&phone=%2B1234567890&username=BingoBot&balance=312'
  },
  {
    username: 'LuckyLena',
    phone: '+1987654321',
    balance: 450,
    token: 'lucky-token-456',
    url: 'http://localhost:3000/?token=lucky-token-456&phone=%2B1987654321&username=LuckyLena&balance=450'
  }
];

function getUrlParams() {
  return Object.fromEntries(new URLSearchParams(window.location.search).entries());
}

function normalizeAuthParam(value) {
  if (value == null || value === '') return null;
  return value;
}

function parseAuthStateFromUrl() {
  const params = getUrlParams();
  const username = normalizeAuthParam(params.username) || 'Guest';
  const phone = normalizeAuthParam(params.phone) || '-';
  const token = normalizeAuthParam(params.token) || 'none';
  const launch = normalizeAuthParam(params.launch) || '';
  const balance = Number(params.balance) || 0;

  return {
    username,
    phone,
    token,
    launch,
    balance,
    verified: false,
  };
}

function getBingoApiUrl() {
  if (window.VITE_API_URL) return window.VITE_API_URL;
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  return isLocal ? 'http://localhost:5000/api' : 'https://bingo-i1br.onrender.com/api';
}

async function resolveAuthState() {
  const state = parseAuthStateFromUrl();
  if (!state.launch) return state;

  try {
    // Bingo backend verifies the launch token server-to-server with the system backend.
    // This avoids browser CORS failures and keeps the system response authoritative.
    const syncResponse = await fetch(`${getBingoApiUrl()}/players/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        launch: state.launch,
        phone: state.phone === '-' ? '' : state.phone,
        username: state.username === 'Guest' ? '' : state.username,
      }),
    });

    const syncContentType = syncResponse.headers.get('content-type') || '';
    const syncData = syncContentType.includes('application/json')
      ? await syncResponse.json()
      : { error: `Bingo auth endpoint returned HTTP ${syncResponse.status}` };

    if (syncResponse.ok && syncData.success && syncData.user) {
      return {
        ...state,
        username: syncData.user.username || state.username,
        phone: syncData.user.phone || state.phone,
        balance: Number(syncData.user.balance ?? 0),
        verified: true,
      };
    }

    throw new Error(syncData.error || 'Bingo backend is not updated for system authentication');
  } catch (error) {
    console.error('[bingo-auth] system verification failed:', error.message);
    return { ...state, verified: false, balance: 0 };
  }
}

function updateAuthUi(state) {
  if (!state) return;
  if (authElements.username) authElements.username.textContent = state.username;
  if (authElements.phone) authElements.phone.textContent = state.phone;
  if (authElements.balance) authElements.balance.textContent = `$${state.balance}`;
  if (authElements.token) authElements.token.textContent = state.token;
  if (authElements.dashboardUsername) authElements.dashboardUsername.textContent = `P=${state.username}`;
  if (authElements.dashboardBalance) authElements.dashboardBalance.textContent = `$${state.balance}`;
  if (authElements.avatarInitial) authElements.avatarInitial.textContent = (state.username || 'G').charAt(0).toUpperCase();
}

function getAuthState() {
  return parseAuthStateFromUrl();
}

function isAuthenticated(state) {
  const hasSecureParams = state && state.launch && state.verified;
  const hasLegacyParams = state && !state.launch && state.token && state.token !== 'none' && state.username && state.username !== 'Guest' && state.phone && state.phone !== '-';
  return Boolean(hasSecureParams || hasLegacyParams);
}

function showAuthModal() {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.style.display = 'flex';
}

function hideAuthModal() {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.style.display = 'none';
}

window.auth = {
  getAuthState,
  resolveAuthState,
  sampleUsers,
  updateAuthUi,
  isAuthenticated,
  showAuthModal,
  hideAuthModal,
};

window.addEventListener('DOMContentLoaded', () => {
  const state = getAuthState();
  updateAuthUi(state);
  const modal = document.getElementById('authModal');
  if (modal) {
    // populate sample links
    const list = document.getElementById('authSampleList');
    if (list) {
      list.innerHTML = '';
      sampleUsers.forEach((u) => {
        const a = document.createElement('a');
        a.href = u.url;
        a.textContent = `${u.username} → open`;
        a.className = 'auth-sample-link';
        a.addEventListener('click', (ev) => {
          ev.preventDefault();
          applyAuthFromUrlString(u.url);
        });
        const li = document.createElement('li');
        li.appendChild(a);
        list.appendChild(li);
      });
    }
  }
});

function parseAuthStateFromUrlString(urlStr) {
  try {
    const u = new URL(urlStr, window.location.href);
    const params = Object.fromEntries(u.searchParams.entries());
    const username = normalizeAuthParam(params.username) || 'Guest';
    const phone = normalizeAuthParam(params.phone) || '-';
    const token = normalizeAuthParam(params.token) || 'none';
    const balance = Number(params.balance) || 0;
    return { username, phone, token, balance };
  } catch (e) {
    return getAuthState();
  }
}

function applyAuthFromUrlString(urlStr) {
  const state = parseAuthStateFromUrlString(urlStr);
  updateAuthUi(state);
  hideAuthModal();
  // notify other code that auth changed
  window.dispatchEvent(new CustomEvent('auth:changed', { detail: state }));
}
