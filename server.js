
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
  CREATE TABLE IF NOT EXISTS characters (
    user_id INTEGER PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

app.use(express.json({ limit: '3mb' }));
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
  const token = jwt.sign({ id: user.id, email: user.email, displayName: user.display_name }, JWT_SECRET, { expiresIn: '30d' });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 1000 * 60 * 60 * 24 * 30
  });
}

app.post('/api/register', (req, res) => {
  const displayName = String(req.body.displayName || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!displayName || !email || !password) return res.status(400).json({ error: 'Bitte Name, E-Mail und Passwort ausfüllen.' });
  if (password.length < 8) return res.status(400).json({ error: 'Passwort bitte mindestens 8 Zeichen lang.' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Diese E-Mail ist bereits registriert.' });

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)').run(email, passwordHash, displayName);
  const user = db.prepare('SELECT id, email, display_name FROM users WHERE id = ?').get(result.lastInsertRowid);
  issueSession(res, user);
  res.status(201).json({ user: { id: user.id, email: user.email, displayName: user.display_name } });
});

app.post('/api/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'E-Mail oder Passwort stimmen nicht.' });
  }
  issueSession(res, user);
  res.json({ user: { id: user.id, email: user.email, displayName: user.display_name } });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

app.get('/api/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/character', authMiddleware, (req, res) => {
  const row = db.prepare('SELECT payload, updated_at FROM characters WHERE user_id = ?').get(req.user.id);
  if (!row) return res.json({ character: null, updatedAt: null });
  res.json({ character: JSON.parse(row.payload), updatedAt: row.updated_at });
});

app.put('/api/character', authMiddleware, (req, res) => {
  const character = req.body.character;
  if (!character || typeof character !== 'object') {
    return res.status(400).json({ error: 'Ungültige Charakterdaten.' });
  }
  const payload = JSON.stringify(character);
  db.prepare(`
    INSERT INTO characters (user_id, payload, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = CURRENT_TIMESTAMP
  `).run(req.user.id, payload);
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`DnD sheet server läuft auf Port ${PORT}`);
});
