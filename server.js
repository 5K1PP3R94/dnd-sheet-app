const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-please';
const COOKIE_NAME = 'dnd_sheet_session';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'app.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

function migrateCharactersTableIfNeeded() {
  const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='characters'").get();
  if (!exists) {
    db.exec(`
      CREATE TABLE characters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL DEFAULT 'Mein Charakter',
        payload TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_characters_user_id ON characters(user_id);
      CREATE INDEX idx_characters_user_active ON characters(user_id, is_active);
    `);
    return;
  }

  const cols = db.prepare(`PRAGMA table_info(characters)`).all().map(c => c.name);
  const isLegacy = cols.includes('user_id') && cols.includes('payload') && !cols.includes('id') && !cols.includes('name');

  if (isLegacy) {
    db.exec(`
      ALTER TABLE characters RENAME TO characters_legacy;
      CREATE TABLE characters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL DEFAULT 'Mein Charakter',
        payload TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_characters_user_id ON characters(user_id);
      CREATE INDEX idx_characters_user_active ON characters(user_id, is_active);
      INSERT INTO characters (user_id, name, payload, is_active, created_at, updated_at)
      SELECT user_id, 'Mein Charakter', payload, 1, COALESCE(updated_at, CURRENT_TIMESTAMP), COALESCE(updated_at, CURRENT_TIMESTAMP)
      FROM characters_legacy;
      DROP TABLE characters_legacy;
    `);
  }
}

migrateCharactersTableIfNeeded();

app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

function authMiddleware(req, res, next) {
  try {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'Nicht eingeloggt.' });
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Sitzung ungültig.' });
  }
}

function issueSession(res, user) {
  const token = jwt.sign(
    { id: user.id, email: user.email, displayName: user.display_name },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 1000 * 60 * 60 * 24 * 30
  });
}

function rowToCharacterMeta(row) {
  return {
    id: row.id,
    name: row.name,
    isActive: !!row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function getActiveCharacterRow(userId) {
  let row = db.prepare(`
    SELECT id, user_id, name, payload, is_active, created_at, updated_at
    FROM characters
    WHERE user_id = ? AND is_active = 1
    ORDER BY updated_at DESC, id DESC
    LIMIT 1
  `).get(userId);

  if (!row) {
    row = db.prepare(`
      SELECT id, user_id, name, payload, is_active, created_at, updated_at
      FROM characters
      WHERE user_id = ?
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `).get(userId);
  }

  return row || null;
}

function setActiveCharacter(userId, characterId) {
  const tx = db.transaction(() => {
    db.prepare(`UPDATE characters SET is_active = 0 WHERE user_id = ?`).run(userId);
    db.prepare(`UPDATE characters SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id = ?`).run(userId, characterId);
  });
  tx();
}

function ensureCharacterForUser(userId) {
  const existing = db.prepare(`SELECT id FROM characters WHERE user_id = ? LIMIT 1`).get(userId);
  if (!existing) {
    const result = db.prepare(`
      INSERT INTO characters (user_id, name, payload, is_active)
      VALUES (?, ?, ?, 1)
    `).run(userId, 'Mein Charakter', JSON.stringify({}));
    return result.lastInsertRowid;
  }
  return existing.id;
}

app.post('/api/register', (req, res) => {
  const displayName = String(req.body.displayName || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const initialCharacter = req.body.initialCharacter && typeof req.body.initialCharacter === 'object'
    ? req.body.initialCharacter
    : {};

  if (!displayName || !email || !password) {
    return res.status(400).json({ error: 'Bitte Name, E-Mail und Passwort ausfüllen.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Passwort bitte mindestens 8 Zeichen lang.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Diese E-Mail ist bereits registriert.' });

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)').run(
    email,
    passwordHash,
    displayName
  );
  const user = db.prepare('SELECT id, email, display_name FROM users WHERE id = ?').get(result.lastInsertRowid);

  db.prepare(`
    INSERT INTO characters (user_id, name, payload, is_active)
    VALUES (?, ?, ?, 1)
  `).run(user.id, 'Mein Charakter', JSON.stringify(initialCharacter));

  issueSession(res, user);
  res.status(201).json({
    user: { id: user.id, email: user.email, displayName: user.display_name }
  });
});

app.post('/api/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'E-Mail oder Passwort stimmen nicht.' });
  }
  ensureCharacterForUser(user.id);
  issueSession(res, user);
  res.json({ user: { id: user.id, email: user.email, displayName: user.display_name } });
});

app.post('/api/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

app.get('/api/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/characters', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, is_active, created_at, updated_at
    FROM characters
    WHERE user_id = ?
    ORDER BY is_active DESC, updated_at DESC, id DESC
  `).all(req.user.id);

  const active = getActiveCharacterRow(req.user.id);
  res.json({
    characters: rows.map(rowToCharacterMeta),
    activeCharacterId: active ? active.id : null
  });
});

app.post('/api/characters', authMiddleware, (req, res) => {
  const mode = String(req.body.mode || 'blank');
  const name = String(req.body.name || '').trim() || 'Neuer Charakter';
  let payload = {};

  if (mode === 'duplicate') {
    const sourceId = Number(req.body.sourceCharacterId || 0);
    const source = db.prepare(`
      SELECT payload FROM characters WHERE id = ? AND user_id = ?
    `).get(sourceId, req.user.id);
    if (!source) return res.status(404).json({ error: 'Vorlage nicht gefunden.' });
    payload = JSON.parse(source.payload);
  } else if (req.body.payload && typeof req.body.payload === 'object') {
    payload = req.body.payload;
  }

  const result = db.prepare(`
    INSERT INTO characters (user_id, name, payload, is_active)
    VALUES (?, ?, ?, 0)
  `).run(req.user.id, name, JSON.stringify(payload));

  const row = db.prepare(`
    SELECT id, name, is_active, created_at, updated_at
    FROM characters
    WHERE id = ? AND user_id = ?
  `).get(result.lastInsertRowid, req.user.id);

  res.status(201).json({ character: rowToCharacterMeta(row) });
});

app.get('/api/characters/:id', authMiddleware, (req, res) => {
  const characterId = Number(req.params.id);
  const row = db.prepare(`
    SELECT id, name, payload, is_active, created_at, updated_at
    FROM characters
    WHERE id = ? AND user_id = ?
  `).get(characterId, req.user.id);

  if (!row) return res.status(404).json({ error: 'Charakter nicht gefunden.' });

  res.json({
    character: JSON.parse(row.payload),
    meta: rowToCharacterMeta(row)
  });
});

app.put('/api/characters/:id', authMiddleware, (req, res) => {
  const characterId = Number(req.params.id);
  const character = req.body.character;
  const newName = req.body.name;

  if (!character || typeof character !== 'object') {
    return res.status(400).json({ error: 'Ungültige Charakterdaten.' });
  }

  const existing = db.prepare(`SELECT id, name FROM characters WHERE id = ? AND user_id = ?`).get(characterId, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Charakter nicht gefunden.' });

  const name = String(newName || existing.name || 'Mein Charakter').trim() || 'Mein Charakter';
  db.prepare(`
    UPDATE characters
    SET payload = ?, name = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).run(JSON.stringify(character), name, characterId, req.user.id);

  res.json({ ok: true });
});

app.post('/api/characters/:id/activate', authMiddleware, (req, res) => {
  const characterId = Number(req.params.id);
  const existing = db.prepare(`SELECT id FROM characters WHERE id = ? AND user_id = ?`).get(characterId, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Charakter nicht gefunden.' });
  setActiveCharacter(req.user.id, characterId);
  res.json({ ok: true });
});

app.delete('/api/characters/:id', authMiddleware, (req, res) => {
  const characterId = Number(req.params.id);
  const countRow = db.prepare(`SELECT COUNT(*) AS count FROM characters WHERE user_id = ?`).get(req.user.id);
  if (countRow.count <= 1) {
    return res.status(400).json({ error: 'Du brauchst mindestens einen Charakter.' });
  }

  const existing = db.prepare(`
    SELECT id, is_active FROM characters WHERE id = ? AND user_id = ?
  `).get(characterId, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Charakter nicht gefunden.' });

  db.prepare(`DELETE FROM characters WHERE id = ? AND user_id = ?`).run(characterId, req.user.id);

  if (existing.is_active) {
    const next = db.prepare(`
      SELECT id FROM characters WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT 1
    `).get(req.user.id);
    if (next) setActiveCharacter(req.user.id, next.id);
  }

  res.json({ ok: true });
});

app.get('/api/character', authMiddleware, (req, res) => {
  const row = getActiveCharacterRow(req.user.id);
  if (!row) return res.json({ character: null, updatedAt: null, activeCharacterId: null, name: null });
  res.json({
    character: JSON.parse(row.payload),
    updatedAt: row.updated_at,
    activeCharacterId: row.id,
    name: row.name
  });
});

app.put('/api/character', authMiddleware, (req, res) => {
  const character = req.body.character;
  const name = String(req.body.name || '').trim();

  if (!character || typeof character !== 'object') {
    return res.status(400).json({ error: 'Ungültige Charakterdaten.' });
  }

  let active = getActiveCharacterRow(req.user.id);
  if (!active) {
    const result = db.prepare(`
      INSERT INTO characters (user_id, name, payload, is_active)
      VALUES (?, ?, ?, 1)
    `).run(req.user.id, name || 'Mein Charakter', JSON.stringify(character));
    active = db.prepare(`SELECT id, name, payload, updated_at FROM characters WHERE id = ?`).get(result.lastInsertRowid);
  } else {
    db.prepare(`
      UPDATE characters
      SET payload = ?, name = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).run(JSON.stringify(character), name || active.name || 'Mein Charakter', active.id, req.user.id);
  }

  res.json({ ok: true, activeCharacterId: active.id });
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`DnD sheet server läuft auf Port ${PORT}`);
});
