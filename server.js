// ═══════════════════════════════════════════════════════════════════
// NEUE ADMIN-ROUTEN – einfügen BEFORE der statischen Datei-Zeilen:
//   app.use(express.static(...))
//   app.get('*', ...)
// ═══════════════════════════════════════════════════════════════════

// GET /admin  → liefert admin.html (nur für Admins, Check im Frontend)
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// POST /api/admin/users  → neuen User anlegen
app.post('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  const displayName = String(req.body.displayName || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const isAdmin = req.body.isAdmin ? 1 : 0;

  if (!displayName || !email || !password) {
    return res.status(400).json({ error: 'Name, E-Mail und Passwort sind Pflichtfelder.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Passwort mindestens 8 Zeichen.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Diese E-Mail ist bereits vergeben.' });

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (email, password_hash, display_name, is_admin) VALUES (?, ?, ?, ?)'
  ).run(email, passwordHash, displayName, isAdmin);

  // Einen leeren Startcharakter anlegen
  db.prepare(
    'INSERT INTO characters (user_id, name, payload, is_active) VALUES (?, ?, ?, 1)'
  ).run(result.lastInsertRowid, 'Mein Charakter', JSON.stringify({}));

  const user = db.prepare('SELECT id, email, display_name, is_admin FROM users WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      isAdmin: !!user.is_admin
    }
  });
});

// PATCH /api/admin/users/:id  → User bearbeiten (Name, E-Mail, Passwort, Admin-Flag)
app.patch('/api/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  const userId = Number(req.params.id);
  if (!userId) return res.status(400).json({ error: 'Ungültige Benutzer-ID.' });

  const existing = db.prepare('SELECT id, email, is_admin FROM users WHERE id = ?').get(userId);
  if (!existing) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });

  const displayName = String(req.body.displayName || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = req.body.password ? String(req.body.password) : null;
  const isAdmin = typeof req.body.isAdmin === 'boolean' ? (req.body.isAdmin ? 1 : 0) : existing.is_admin;

  if (!displayName || !email) {
    return res.status(400).json({ error: 'Name und E-Mail sind Pflichtfelder.' });
  }
  if (password && password.length < 8) {
    return res.status(400).json({ error: 'Neues Passwort mindestens 8 Zeichen.' });
  }

  // E-Mail-Konflikt prüfen (nur wenn geändert)
  if (email !== existing.email) {
    const conflict = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, userId);
    if (conflict) return res.status(409).json({ error: 'Diese E-Mail ist bereits vergeben.' });
  }

  // Letzten Admin schützen: darf sich nicht selbst den Admin entziehen
  // wenn er der einzige Admin ist
  if (userId === req.user.id && !isAdmin) {
    const adminCount = db.prepare('SELECT COUNT(*) AS count FROM users WHERE is_admin = 1').get().count;
    if (adminCount <= 1) {
      return res.status(400).json({ error: 'Du kannst dir nicht selbst die Admin-Rechte entziehen – du bist der einzige Admin.' });
    }
  }

  if (password) {
    const passwordHash = bcrypt.hashSync(password, 10);
    db.prepare(
      'UPDATE users SET display_name = ?, email = ?, password_hash = ?, is_admin = ? WHERE id = ?'
    ).run(displayName, email, passwordHash, isAdmin, userId);
  } else {
    db.prepare(
      'UPDATE users SET display_name = ?, email = ?, is_admin = ? WHERE id = ?'
    ).run(displayName, email, isAdmin, userId);
  }

  const updated = db.prepare('SELECT id, email, display_name, is_admin FROM users WHERE id = ?').get(userId);
  res.json({
    user: {
      id: updated.id,
      email: updated.email,
      displayName: updated.display_name,
      isAdmin: !!updated.is_admin
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// ENDE NEUE ROUTEN
// ═══════════════════════════════════════════════════════════════════
