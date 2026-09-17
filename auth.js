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
  const balance = Number(params.balance) || 0;

  return {
    username,
    phone,
    token,
    balance,
  };
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
  return state && state.token && state.token !== 'none' && state.username && state.username !== 'Guest' && state.phone && state.phone !== '-';
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
