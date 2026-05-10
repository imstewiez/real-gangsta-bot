'use strict';
const path = require('path');
const fs = require('fs');

let _locale = 'pt-PT';
let _cache = {};

function _load(locale) {
  const filePath = path.join(__dirname, '..', 'content', 'locales', `${locale}.json`);
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return {};
    }
  }
  return {};
}

function setLocale(lang) {
  _locale = lang;
  _cache = _load(lang);
}

function t(key, fallback) {
  const value = _cache[key];
  return value !== undefined ? value : fallback;
}

// preload default
setLocale(_locale);

module.exports = { t, setLocale };
