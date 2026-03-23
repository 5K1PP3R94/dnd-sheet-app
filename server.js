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
const ADMIN_EMAILS = String(process.env.ADMIN_EMAILS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
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

function migrateUsersTableIfNeeded() {
  const cols = db.prepare(`PRAGMA table_info(users)`).all().map(c => c.name);
  if (!cols.includes('is_admin')) {
    db.exec(`ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0`);
  }
}
migrateUsersTableIfNeeded();

function migrateGroupsTablesIfNeeded() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      owner_user_id INTEGER NOT NULL,
      invite_code TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS group_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(group_id, user_id),
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
    CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_groups_owner_user_id ON groups(owner_user_id);
  `);

  const characterCols = db.prepare(`PRAGMA table_info(characters)`).all().map(c => c.name);
  if (!characterCols.includes('group_id')) {
    db.exec(`ALTER TABLE characters ADD COLUMN group_id INTEGER`);
  }
}
migrateGroupsTablesIfNeeded();

function makeInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function createUniqueInviteCode() {
  let code = makeInviteCode();
  while (db.prepare(`SELECT id FROM groups WHERE invite_code = ?`).get(code)) {
    code = makeInviteCode();
  }
  return code;
}

function getUserGroups(userId) {
  return db.prepare(`
    SELECT
      g.id,
      g.name,
      g.invite_code,
      g.owner_user_id,
      g.created_at,
      g.updated_at,
      gm.role,
      (
        SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id = g.id
      ) AS member_count,
      (
        SELECT COUNT(*) FROM characters c WHERE c.group_id = g.id
      ) AS character_count
    FROM groups g
    INNER JOIN group_members gm ON gm.group_id = g.id
    WHERE gm.user_id = ?
    ORDER BY g.updated_at DESC, g.id DESC
  `).all(userId).map(row => ({
    id: row.id,
    name: row.name,
    inviteCode: row.invite_code,
    ownerUserId: row.owner_user_id,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    memberCount: row.member_count || 0,
    characterCount: row.character_count || 0
  }));
}

function getGroupForUser(groupId, userId) {
  return db.prepare(`
    SELECT
      g.id,
      g.name,
      g.invite_code,
      g.owner_user_id,
      g.created_at,
      g.updated_at,
      gm.role
    FROM groups g
    INNER JOIN group_members gm ON gm.group_id = g.id
    WHERE g.id = ? AND gm.user_id = ?
    LIMIT 1
  `).get(groupId, userId);
}

function ensureGroupOwnerStillMember(groupId, fallbackUserId) {
  const ownerMember = db.prepare(`SELECT id FROM group_members WHERE group_id = ? AND role = 'owner' LIMIT 1`).get(groupId);
  if (ownerMember) return;
  const next = db.prepare(`SELECT user_id FROM group_members WHERE group_id = ? ORDER BY id ASC LIMIT 1`).get(groupId);
  if (!next) {
    db.prepare(`DELETE FROM groups WHERE id = ?`).run(groupId);
    return;
  }
  db.prepare(`UPDATE group_members SET role = 'owner' WHERE group_id = ? AND user_id = ?`).run(groupId, next.user_id);
  db.prepare(`UPDATE groups SET owner_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(next.user_id, groupId);
}


function isUserAdmin(user) {
  if (!user) return false;
  if (Number(user.is_admin || 0) === 1) return true;
  return ADMIN_EMAILS.includes(String(user.email || '').toLowerCase());
}

function ensureAdminFlagForUser(userId) {
  const user = db.prepare(`SELECT id, email, is_admin FROM users WHERE id = ?`).get(userId);
  if (!user) return false;
  const firstUser = db.prepare(`SELECT id FROM users ORDER BY id ASC LIMIT 1`).get();
  const shouldBeAdmin = (firstUser && Number(firstUser.id) === Number(userId)) || ADMIN_EMAILS.includes(String(user.email || '').toLowerCase());
  if (shouldBeAdmin && Number(user.is_admin || 0) !== 1) {
    db.prepare(`UPDATE users SET is_admin = 1 WHERE id = ?`).run(userId);
    return true;
  }
  return Number(user.is_admin || 0) === 1;
}

function adminMiddleware(req, res, next) {
  const user = db.prepare(`SELECT id, email, display_name, is_admin FROM users WHERE id = ?`).get(req.user.id);
  if (!isUserAdmin(user)) {
    return res.status(403).json({ error: 'Adminzugang erforderlich.' });
  }
  req.adminUser = user;
  next();
}

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
    { id: user.id, email: user.email, displayName: user.display_name, isAdmin: isUserAdmin(user) },
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
    updatedAt: row.updated_at,
    groupId: row.group_id || null
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
  ensureAdminFlagForUser(result.lastInsertRowid);
  const user = db.prepare('SELECT id, email, display_name, is_admin FROM users WHERE id = ?').get(result.lastInsertRowid);

  db.prepare(`
    INSERT INTO characters (user_id, name, payload, is_active)
    VALUES (?, ?, ?, 1)
  `).run(user.id, 'Mein Charakter', JSON.stringify(initialCharacter));

  issueSession(res, user);
  res.status(201).json({
    user: { id: user.id, email: user.email, displayName: user.display_name, isAdmin: isUserAdmin(user) }
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
  ensureAdminFlagForUser(user.id);
  const freshUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  issueSession(res, freshUser);
  res.json({ user: { id: freshUser.id, email: freshUser.email, displayName: freshUser.display_name, isAdmin: isUserAdmin(freshUser) } });
});

app.post('/api/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

app.get('/api/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, email, display_name, is_admin FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(401).json({ error: 'Sitzung ungültig.' });
  ensureAdminFlagForUser(user.id);
  const freshUser = db.prepare('SELECT id, email, display_name, is_admin FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: { id: freshUser.id, email: freshUser.email, displayName: freshUser.display_name, isAdmin: isUserAdmin(freshUser) } });
});

app.get('/api/characters', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, is_active, created_at, updated_at, group_id
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
  const requestedGroupId = req.body.groupId == null || req.body.groupId === '' ? null : Number(req.body.groupId);

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

  let groupId = null;
  if (requestedGroupId) {
    const group = getGroupForUser(requestedGroupId, req.user.id);
    if (!group) return res.status(404).json({ error: 'Spielgruppe nicht gefunden.' });
    groupId = requestedGroupId;
  }

  const result = db.prepare(`
    INSERT INTO characters (user_id, name, payload, is_active, group_id)
    VALUES (?, ?, ?, 0, ?)
  `).run(req.user.id, name, JSON.stringify(payload), groupId);

  const row = db.prepare(`
    SELECT id, name, is_active, created_at, updated_at, group_id
    FROM characters
    WHERE id = ? AND user_id = ?
  `).get(result.lastInsertRowid, req.user.id);

  res.status(201).json({ character: rowToCharacterMeta(row) });
});

app.get('/api/characters/:id', authMiddleware, (req, res) => {
  const characterId = Number(req.params.id);
  const row = db.prepare(`
    SELECT id, name, payload, is_active, created_at, updated_at, group_id
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
  const requestedGroupId = req.body.groupId === undefined ? undefined : (req.body.groupId === null || req.body.groupId === '' ? null : Number(req.body.groupId));

  if (!character || typeof character !== 'object') {
    return res.status(400).json({ error: 'Ungültige Charakterdaten.' });
  }

  const existing = db.prepare(`SELECT id, name, group_id FROM characters WHERE id = ? AND user_id = ?`).get(characterId, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Charakter nicht gefunden.' });

  const name = String(newName || existing.name || 'Mein Charakter').trim() || 'Mein Charakter';
  let groupId = existing.group_id || null;
  if (requestedGroupId !== undefined) {
    if (requestedGroupId === null) {
      groupId = null;
    } else {
      const group = getGroupForUser(requestedGroupId, req.user.id);
      if (!group) return res.status(404).json({ error: 'Spielgruppe nicht gefunden.' });
      groupId = requestedGroupId;
    }
  }
  db.prepare(`
    UPDATE characters
    SET payload = ?, name = ?, group_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).run(JSON.stringify(character), name, groupId, characterId, req.user.id);

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
    name: row.name,
    groupId: row.group_id || null
  });
});

app.put('/api/character', authMiddleware, (req, res) => {
  const character = req.body.character;
  const name = String(req.body.name || '').trim();
  const requestedGroupId = req.body.groupId === undefined ? undefined : (req.body.groupId === null || req.body.groupId === '' ? null : Number(req.body.groupId));

  if (!character || typeof character !== 'object') {
    return res.status(400).json({ error: 'Ungültige Charakterdaten.' });
  }

  let active = getActiveCharacterRow(req.user.id);
  let targetGroupId = null;
  if (requestedGroupId !== undefined) {
    if (requestedGroupId === null) {
      targetGroupId = null;
    } else {
      const group = getGroupForUser(requestedGroupId, req.user.id);
      if (!group) return res.status(404).json({ error: 'Spielgruppe nicht gefunden.' });
      targetGroupId = requestedGroupId;
    }
  }
  if (!active) {
    const result = db.prepare(`
      INSERT INTO characters (user_id, name, payload, is_active, group_id)
      VALUES (?, ?, ?, 1, ?)
    `).run(req.user.id, name || 'Mein Charakter', JSON.stringify(character), targetGroupId);
    active = db.prepare(`SELECT id, name, payload, updated_at, group_id FROM characters WHERE id = ?`).get(result.lastInsertRowid);
  } else {
    db.prepare(`
      UPDATE characters
      SET payload = ?, name = ?, group_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).run(JSON.stringify(character), name || active.name || 'Mein Charakter', requestedGroupId === undefined ? (active.group_id || null) : targetGroupId, active.id, req.user.id);
  }

  res.json({ ok: true, activeCharacterId: active.id });
});



app.get('/api/groups', authMiddleware, (req, res) => {
  res.json({ groups: getUserGroups(req.user.id) });
});

app.post('/api/groups', authMiddleware, (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Bitte einen Gruppennamen eingeben.' });

  const inviteCode = createUniqueInviteCode();
  const tx = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO groups (name, owner_user_id, invite_code)
      VALUES (?, ?, ?)
    `).run(name, req.user.id, inviteCode);
    db.prepare(`
      INSERT INTO group_members (group_id, user_id, role)
      VALUES (?, ?, 'owner')
    `).run(result.lastInsertRowid, req.user.id);
    return result.lastInsertRowid;
  });
  const groupId = tx();
  const group = getGroupForUser(groupId, req.user.id);
  res.status(201).json({
    group: {
      id: group.id,
      name: group.name,
      inviteCode: group.invite_code,
      ownerUserId: group.owner_user_id,
      role: group.role,
      createdAt: group.created_at,
      updatedAt: group.updated_at,
      memberCount: 1,
      characterCount: 0
    }
  });
});

app.post('/api/groups/join', authMiddleware, (req, res) => {
  const inviteCode = String(req.body.inviteCode || '').trim().toUpperCase();
  if (!inviteCode) return res.status(400).json({ error: 'Bitte Einladungscode eingeben.' });

  const group = db.prepare(`SELECT * FROM groups WHERE invite_code = ?`).get(inviteCode);
  if (!group) return res.status(404).json({ error: 'Spielgruppe mit diesem Code nicht gefunden.' });

  const existing = db.prepare(`SELECT id FROM group_members WHERE group_id = ? AND user_id = ?`).get(group.id, req.user.id);
  if (!existing) {
    db.prepare(`
      INSERT INTO group_members (group_id, user_id, role)
      VALUES (?, ?, 'member')
    `).run(group.id, req.user.id);
  }
  db.prepare(`UPDATE groups SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(group.id);
  const joined = getGroupForUser(group.id, req.user.id);
  res.json({
    group: {
      id: joined.id,
      name: joined.name,
      inviteCode: joined.invite_code,
      ownerUserId: joined.owner_user_id,
      role: joined.role,
      createdAt: joined.created_at,
      updatedAt: joined.updated_at
    }
  });
});

app.get('/api/groups/:id', authMiddleware, (req, res) => {
  const groupId = Number(req.params.id);
  const group = getGroupForUser(groupId, req.user.id);
  if (!group) return res.status(404).json({ error: 'Spielgruppe nicht gefunden.' });

  const members = db.prepare(`
    SELECT
      u.id,
      u.display_name,
      u.email,
      gm.role,
      gm.created_at,
      COUNT(c.id) AS character_count
    FROM group_members gm
    INNER JOIN users u ON u.id = gm.user_id
    LEFT JOIN characters c ON c.user_id = u.id AND c.group_id = gm.group_id
    WHERE gm.group_id = ?
    GROUP BY u.id, gm.id
    ORDER BY CASE gm.role WHEN 'owner' THEN 0 ELSE 1 END, u.display_name COLLATE NOCASE ASC
  `).all(groupId).map(row => ({
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    role: row.role,
    joinedAt: row.created_at,
    characterCount: row.character_count || 0
  }));

  const characters = db.prepare(`
    SELECT
      c.id,
      c.name,
      c.updated_at,
      c.user_id,
      u.display_name AS owner_name
    FROM characters c
    INNER JOIN users u ON u.id = c.user_id
    WHERE c.group_id = ?
    ORDER BY u.display_name COLLATE NOCASE ASC, c.name COLLATE NOCASE ASC
  `).all(groupId).map(row => ({
    id: row.id,
    name: row.name,
    updatedAt: row.updated_at,
    userId: row.user_id,
    ownerName: row.owner_name
  }));

  res.json({
    group: {
      id: group.id,
      name: group.name,
      inviteCode: group.invite_code,
      ownerUserId: group.owner_user_id,
      role: group.role,
      createdAt: group.created_at,
      updatedAt: group.updated_at
    },
    members,
    characters
  });
});

app.post('/api/groups/:id/regenerate-code', authMiddleware, (req, res) => {
  const groupId = Number(req.params.id);
  const group = getGroupForUser(groupId, req.user.id);
  if (!group) return res.status(404).json({ error: 'Spielgruppe nicht gefunden.' });
  if (group.role !== 'owner') return res.status(403).json({ error: 'Nur der Gruppenleiter darf den Code erneuern.' });

  const inviteCode = createUniqueInviteCode();
  db.prepare(`UPDATE groups SET invite_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(inviteCode, groupId);

  res.json({ inviteCode });
});

app.post('/api/groups/:id/leave', authMiddleware, (req, res) => {
  const groupId = Number(req.params.id);
  const group = getGroupForUser(groupId, req.user.id);
  if (!group) return res.status(404).json({ error: 'Spielgruppe nicht gefunden.' });

  const tx = db.transaction(() => {
    db.prepare(`UPDATE characters SET group_id = NULL WHERE user_id = ? AND group_id = ?`).run(req.user.id, groupId);
    db.prepare(`DELETE FROM group_members WHERE group_id = ? AND user_id = ?`).run(groupId, req.user.id);
    if (group.role === 'owner') {
      ensureGroupOwnerStillMember(groupId, req.user.id);
    } else {
      const count = db.prepare(`SELECT COUNT(*) AS count FROM group_members WHERE group_id = ?`).get(groupId);
      if (!count || count.count === 0) {
        db.prepare(`DELETE FROM groups WHERE id = ?`).run(groupId);
      }
    }
    db.prepare(`UPDATE groups SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(groupId);
  });
  tx();

  res.json({ ok: true });
});

app.post('/api/characters/:id/group', authMiddleware, (req, res) => {
  const characterId = Number(req.params.id);
  const requestedGroupId = req.body.groupId === null || req.body.groupId === '' || req.body.groupId === undefined
    ? null
    : Number(req.body.groupId);

  const existing = db.prepare(`SELECT id FROM characters WHERE id = ? AND user_id = ?`).get(characterId, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Charakter nicht gefunden.' });

  if (requestedGroupId !== null) {
    const group = getGroupForUser(requestedGroupId, req.user.id);
    if (!group) return res.status(404).json({ error: 'Spielgruppe nicht gefunden.' });
  }

  db.prepare(`
    UPDATE characters
    SET group_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).run(requestedGroupId, characterId, req.user.id);

  res.json({ ok: true, groupId: requestedGroupId });
});


app.get('/api/admin/stats', authMiddleware, adminMiddleware, (req, res) => {
  const users = db.prepare(`SELECT COUNT(*) AS count FROM users`).get().count;
  const characters = db.prepare(`SELECT COUNT(*) AS count FROM characters`).get().count;
  res.json({ stats: { users, characters } });
});

app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT
      u.id,
      u.email,
      u.display_name,
      u.is_admin,
      u.created_at,
      COUNT(c.id) AS character_count,
      MAX(c.updated_at) AS last_character_update
    FROM users u
    LEFT JOIN characters c ON c.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at DESC, u.id DESC
  `).all();

  res.json({
    users: rows.map(row => ({
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      isAdmin: !!row.is_admin || ADMIN_EMAILS.includes(String(row.email || '').toLowerCase()),
      createdAt: row.created_at,
      characterCount: row.character_count || 0,
      lastCharacterUpdate: row.last_character_update || null
    }))
  });
});

app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  const userId = Number(req.params.id);
  if (!userId) return res.status(400).json({ error: 'Ungültige Benutzer-ID.' });
  if (userId === req.user.id) return res.status(400).json({ error: 'Du kannst deinen eigenen Admin-Account hier nicht löschen.' });

  const existing = db.prepare(`SELECT id, email FROM users WHERE id = ?`).get(userId);
  if (!existing) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });

  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM characters WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
  });
  tx();

  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`DnD sheet server läuft auf Port ${PORT}`);
});
