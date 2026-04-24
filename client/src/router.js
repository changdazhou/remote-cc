// 极简 hash 路由
// 支持：
//   /#/           → home
//   /#/session/:id → 直接打开指定 session 的终端
//   /#/new         → 新建会话页
//   /#/settings    → 设置页

import { ref, watch } from 'vue';

export const route = ref(parseHash());

function parseHash() {
  const hash = location.hash.replace(/^#\/?/, '') || '';
  if (!hash || hash === '/') return { name: 'home', params: {} };
  const parts = hash.split('/').filter(Boolean);
  if (parts[0] === 'session' && parts[1]) return { name: 'session', params: { id: parts[1] } };
  if (parts[0] === 'new')      return { name: 'new-session', params: {} };
  if (parts[0] === 'settings') return { name: 'settings', params: {} };
  return { name: 'home', params: {} };
}

window.addEventListener('hashchange', () => {
  route.value = parseHash();
});

export function navigate(name, params = {}) {
  let hash = '#/';
  if (name === 'session' && params.id) hash = `#/session/${params.id}`;
  else if (name === 'new-session') hash = '#/new';
  else if (name === 'settings')    hash = '#/settings';
  // Replace so back button goes to previous view, not same route
  history.replaceState(null, '', hash);
  route.value = { name, params };
}
