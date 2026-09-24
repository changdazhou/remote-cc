'use strict';
// 命令行工具（rcc-tui / remotecc）的界面语言：RCC_LANG 环境变量 > ~/.rcc/lang > 中文
const fs = require('fs');
const os = require('os');
const path = require('path');

function langFilePath(home = os.homedir()) {
  return path.join(home, '.rcc', 'lang');
}

function normalizeLang(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v.startsWith('en')) return 'en';
  if (v.startsWith('zh')) return 'zh';
  return '';
}

function readLangFile(home) {
  try { return normalizeLang(fs.readFileSync(langFilePath(home), 'utf8').split(/\r?\n/)[0]); }
  catch (_) { return ''; }
}

function cliLang(env = process.env, home = os.homedir()) {
  return normalizeLang(env.RCC_LANG) || readLangFile(home) || 'zh';
}

function translator(lang = cliLang()) {
  return (zh, en) => (lang === 'en' ? en : zh);
}

module.exports = { cliLang, normalizeLang, langFilePath, translator };
