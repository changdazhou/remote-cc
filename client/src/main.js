import { createApp, watch } from 'vue';
import App from './App.vue';
import { settings, getTheme } from './settings.js';

const app = createApp(App);
app.mount('#app');

// 把主题属性同步到 html 元素，让 CSS 变量全局生效
function applyTheme() {
  const html = document.documentElement;
  const theme = getTheme(settings.colorTheme);
  html.setAttribute('data-theme',    settings.colorTheme);
  html.setAttribute('data-ui-style', settings.uiStyle);
  // 浅色/深色切换
  if (theme.dark === false) {
    html.setAttribute('data-light', '');
  } else {
    html.removeAttribute('data-light');
  }
}

applyTheme();
watch(() => settings.colorTheme, applyTheme);
watch(() => settings.uiStyle,    applyTheme);
