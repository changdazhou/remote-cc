// 页面级的最近用户操作时间，用来判断当前设备是否是“正在使用”的那一个
let lastActivityAt = 0;

if (typeof window !== 'undefined') {
  const mark = () => { lastActivityAt = Date.now(); };
  for (const type of ['pointerdown', 'keydown', 'touchstart']) {
    window.addEventListener(type, mark, { capture: true, passive: true });
  }
}

export function recentlyActive(withinMs) {
  return Date.now() - lastActivityAt < withinMs;
}
