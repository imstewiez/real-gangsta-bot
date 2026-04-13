'use strict';

function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function mentionUser(id) {
  return id ? `<@${id}>` : '\u2014';
}

function formatRoleList(items = []) {
  if (!items.length) return '\u2014';
  return items.map(v => `\u2022 ${v}`).join('\n');
}

function formatPersonName(str = '') {
  const cleaned = String(str || '')
    .trim()
    .replace(/[^\p{L}\s\-']/gu, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map(part => part
      .split('-')
      .map(p => p ? `${p.charAt(0).toUpperCase()}${p.slice(1)}` : p)
      .join('-'))
    .join(' ');
}

function chunkStringByLimit(items = [], maxLen = 1800) {
  const out = [];
  let current = '';
  for (const item of items) {
    const next = current ? `${current}\n${item}` : item;
    if (next.length > maxLen) {
      if (current) out.push(current);
      current = item;
    } else {
      current = next;
    }
  }
  if (current) out.push(current);
  return out.length ? out : ['\u2014'];
}

function nowPT() {
  const d = new Date();
  return String(d.getDate()).padStart(2, '0') + '/' +
    String(d.getMonth() + 1).padStart(2, '0') + '/' +
    d.getFullYear() + ' ' +
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0');
}

function truncate(str, max = 100) {
  if (!str || str.length <= max) return str || '';
  return str.slice(0, max - 3).trimEnd() + '...';
}

function weekBounds(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(d.setDate(diff));
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

module.exports = {
  unique,
  mentionUser,
  formatRoleList,
  formatPersonName,
  chunkStringByLimit,
  nowPT,
  truncate,
  weekBounds,
};
