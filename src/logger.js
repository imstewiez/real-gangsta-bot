const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const currentLevel = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] || LEVELS.info;
const sessionStamp = new Date().toISOString().replace(/[:.]/g, '-');

const MAX_LOG_BYTES = parseInt(process.env.LOG_MAX_BYTES, 10) || 10 * 1024 * 1024; // 10MB
const MAX_LOG_BACKUPS = parseInt(process.env.LOG_MAX_BACKUPS, 10) || 3;
const SESSION_KEEP_DAYS = parseInt(process.env.LOG_SESSION_KEEP_DAYS, 10) || 7;

function shouldLog(levelName) {
  const value = LEVELS[levelName] || LEVELS.info;
  return value >= currentLevel;
}

function ensureLogDir() {
  const dir = path.resolve(process.cwd(), process.env.DEBUG_LOG_DIR || './logs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getLogPaths() {
  const dir = ensureLogDir();
  const baseFile = process.env.DEBUG_LOG_FILE || 'realgangsta-debug.log';
  const ext = path.extname(baseFile) || '.log';
  const stem = path.basename(baseFile, ext);
  return {
    dir,
    text: path.join(dir, baseFile),
    sessionText: path.join(dir, `${stem}-${sessionStamp}${ext}`),
    jsonl: path.join(dir, `${stem}-${sessionStamp}.jsonl`),
  };
}

const SENSITIVE_KEYS =
  /\b(token|password|secret|api_key|auth_key|private_key|secret_key|authorization|credential|service_account|database_url|connection_string)\b/i;

function redactObject(obj, depth = 0) {
  if (depth > 4 || !obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(v => redactObject(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.test(k) && typeof v === 'string') {
      out[k] = v.length > 8 ? v.slice(0, 4) + '***' : '***';
    } else if (/\b(url|uri)\b/i.test(k) && /(password|pass|pwd)=/i.test(String(v))) {
      return '[REDACTED]';
    } else if (typeof v === 'object' && v !== null) {
      out[k] = redactObject(v, depth + 1);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function stringifyArg(value) {
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(redactObject(value));
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function appendStructured(level, args, line) {
  const paths = getLogPaths();
  const ts = new Date().toISOString();
  const record = {
    ts,
    level,
    session: sessionStamp,
    line,
    args: args.map(a => {
      if (a instanceof Error) return { error: a.stack || a.message };
      if (typeof a === 'object' && a !== null) return redactObject(a);
      return { value: String(a) };
    }),
  };
  try {
    fs.appendFileSync(paths.jsonl, `${JSON.stringify(record)}\n`, 'utf8');
  } catch {}
}

function appendLine(level, args) {
  const ts = new Date().toISOString();
  const msg = args.map(stringifyArg).join(' ');
  const line = `${ts} ${level} ${msg}`;
  const paths = getLogPaths();
  try {
    fs.appendFileSync(paths.text, `${line}\n`, 'utf8');
    fs.appendFileSync(paths.sessionText, `${line}\n`, 'utf8');
    appendStructured(level, args, line);
  } catch (e) {
    // Falha de I/O no log — não silenciar, mas evitar recursão
    process.stderr.write(`[LOGGER I/O ERROR] ${e?.message || e}\n`);
  }
  return line;
}

function debug(...args) {
  if (!shouldLog('debug')) return;
  console.debug(appendLine('[DEBUG]', args));
}

function log(...args) {
  if (!shouldLog('info')) return;
  console.log(appendLine('[INFO]', args));
}

function warn(...args) {
  if (!shouldLog('warn')) return;
  console.warn(appendLine('[WARN]', args));
}

function error(...args) {
  if (!shouldLog('error')) return;
  console.error(appendLine('[ERROR]', args));
}

function audit(event, meta = {}, level = 'info') {
  const payload = { event, ...meta };
  if (level === 'debug') return debug('[AUDIT]', payload);
  if (level === 'warn') return warn('[AUDIT]', payload);
  if (level === 'error') return error('[AUDIT]', payload);
  return log('[AUDIT]', payload);
}

/**
 * Returns a catch handler that logs the error at warn level with context.
 * Usage: somePromise.catch(swallow('PANEL EDIT'))
 * This replaces .catch(() => {}) with contextual logging.
 */
function swallow(context) {
  return e => {
    warn(`[${context}] ${e?.message || e}`);
  };
}

// ── Log rotation ─────────────────────────────────────────────────────────────
// Roda o ficheiro principal quando excede MAX_LOG_BYTES, mantendo até
// MAX_LOG_BACKUPS cópias (.1, .2, .3). Os ficheiros por sessão (com timestamp
// no nome) não rodam — são limpos por idade em cleanupOldSessions().
let _rotationsCount = 0;

function rotateIfNeeded(filePath) {
  let st;
  try {
    st = fs.statSync(filePath);
  } catch {
    return false;
  }
  if (st.size <= MAX_LOG_BYTES) return false;
  // Shift backups: .N → .(N+1), começando do mais alto para não sobrescrever
  for (let i = MAX_LOG_BACKUPS - 1; i >= 1; i--) {
    const src = `${filePath}.${i}`;
    const dst = `${filePath}.${i + 1}`;
    if (fs.existsSync(src)) {
      try {
        fs.renameSync(src, dst);
      } catch (e) {
        process.stderr.write(`[LOGGER] rotate fail ${src}: ${e.message}\n`);
      }
    }
  }
  try {
    fs.renameSync(filePath, `${filePath}.1`);
  } catch (e) {
    process.stderr.write(`[LOGGER] rotate fail ${filePath}: ${e.message}\n`);
    return false;
  }
  // Apaga a cópia mais antiga (overflow)
  const overflow = `${filePath}.${MAX_LOG_BACKUPS + 1}`;
  if (fs.existsSync(overflow))
    try {
      fs.unlinkSync(overflow);
    } catch {}
  _rotationsCount++;
  return true;
}

function cleanupOldSessions() {
  let removed = 0;
  try {
    const dir = ensureLogDir();
    const cutoff = Date.now() - SESSION_KEEP_DAYS * 24 * 60 * 60 * 1000;
    const baseFile = process.env.DEBUG_LOG_FILE || 'realgangsta-debug.log';
    const ext = path.extname(baseFile) || '.log';
    const stem = path.basename(baseFile, ext);
    // Match: stem-{ISO timestamp}.log e stem-{ISO timestamp}.jsonl
    const re = new RegExp(
      `^${stem.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}-\\d{4}-\\d{2}-\\d{2}T.*\\.(log|jsonl)$`
    );
    for (const name of fs.readdirSync(dir)) {
      if (!re.test(name)) continue;
      const full = path.join(dir, name);
      try {
        const st = fs.statSync(full);
        if (st.mtimeMs < cutoff) {
          fs.unlinkSync(full);
          removed++;
        }
      } catch {}
    }
  } catch {}
  return removed;
}

let _maintenanceTimer = null;

function startLogMaintenance() {
  // Cleanup imediato + rotação se necessário
  const removed = cleanupOldSessions();
  if (removed > 0) {
    try {
      console.log(`[LOGGER] Limpas ${removed} session log(s) com >${SESSION_KEEP_DAYS}d.`);
    } catch {}
  }
  const paths = getLogPaths();
  rotateIfNeeded(paths.text);

  // Verificação periódica a cada 30min
  if (_maintenanceTimer) clearInterval(_maintenanceTimer);
  _maintenanceTimer = setInterval(
    () => {
      try {
        const p = getLogPaths();
        if (rotateIfNeeded(p.text)) {
          try {
            console.log(`[LOGGER] Rotação efectuada — ${p.text}`);
          } catch {}
        }
      } catch {}
    },
    30 * 60 * 1000
  );
  if (_maintenanceTimer.unref) _maintenanceTimer.unref();
  return _maintenanceTimer;
}

function stopLogMaintenance() {
  if (_maintenanceTimer) {
    clearInterval(_maintenanceTimer);
    _maintenanceTimer = null;
  }
}

function getRotationsCount() {
  return _rotationsCount;
}

/** Generate a short correlation ID for request tracing */
function newCorrelationId() {
  return `req_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
}

/** Create a scoped logger that prepends correlation ID to all messages */
function scopedLogger(correlationId) {
  const prefix = `[${correlationId}]`;
  return {
    log: (...args) => log(prefix, ...args),
    warn: (...args) => warn(prefix, ...args),
    audit: (action, data, level) => audit(action, { ...data, correlationId }, level),
    id: correlationId,
  };
}

module.exports = {
  debug,
  log,
  warn,
  error,
  audit,
  getLogPaths,
  sessionStamp,
  swallow,
  newCorrelationId,
  scopedLogger,
  startLogMaintenance,
  stopLogMaintenance,
  rotateIfNeeded,
  cleanupOldSessions,
  getRotationsCount,
};
