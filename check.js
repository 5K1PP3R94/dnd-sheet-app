(()=>{
      const API_BASE = '';
      let authState = {
        user: null,
        saveTimer: null,
        currentCharacterId: null,
        characters: [],
        localModeChosen: false,
        adminUsers: [],
        groups: [],
        selectedGroupId: null,
        selectedGroupDetails: null
      };

      const style = document.createElement('style');
      style.textContent = `
        .auth-bar {
          display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;
          margin-top:16px; padding:12px 14px; border-radius:18px;
          border:1px solid rgba(242,210,162,.14); background:rgba(22,12,12,.72);
        }
        .auth-user { color: var(--muted); font-size: 14px; }
        .auth-actions { display:flex; gap:8px; flex-wrap:wrap; }
        .auth-btn { padding:8px 12px; font-size:12px; border-radius:999px; }
        .auth-backdrop {
          position: fixed; inset: 0; background: rgba(4, 2, 2, 0.72); backdrop-filter: blur(8px);
          display:none; align-items:center; justify-content:center; z-index:9999; padding:20px;
        }
        .auth-backdrop.visible { display:flex; }
        .auth-modal {
          width:min(1100px, 100%); max-height:min(90vh, 1000px); overflow:auto;
          background: linear-gradient(180deg, rgba(30,18,18,.98), rgba(15,8,8,.98));
          border:1px solid rgba(242,210,162,.16); border-radius:28px; box-shadow:0 30px 90px rgba(0,0,0,.45);
          padding:24px; position:relative;
        }
        .auth-modal::after {
          content:"🐉"; position:absolute; right:16px; bottom:6px; opacity:.05; font-size:clamp(64px, 12vw, 140px);
          transform:scaleX(-1) rotate(-8deg); pointer-events:none;
        }
        .auth-grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:20px; }
        .auth-card, .dashboard-card {
          background:rgba(22,12,12,.65); border:1px solid rgba(198,40,40,.18); border-radius:22px; padding:18px;
        }
        .auth-card h3, .dashboard-card h3 { margin:0 0 8px 0; color:var(--gold); }
        .auth-card p, .dashboard-card p { color:var(--muted); font-size:14px; line-height:1.5; margin:0 0 14px 0; }
        .auth-note { color:var(--soft); font-size:13px; margin-top:12px; }
        .auth-error, .auth-success { min-height:20px; font-size:13px; margin-top:10px; }
        .auth-error { color:#fca5a5; }
        .auth-success { color:#bbf7d0; }
        .dashboard-wrap { display:grid; grid-template-columns: 1.1fr .9fr; gap:20px; margin-top:20px; }
        .dashboard-card { display:none; }
        .dashboard-card.visible { display:block; }
        .character-list { display:grid; gap:12px; }
        .character-item {
          display:flex; justify-content:space-between; align-items:center; gap:12px;
          padding:12px 14px; border-radius:16px; border:1px solid rgba(242,210,162,.12); background:rgba(0,0,0,.18);
        }
        .character-item.active {
          border-color: rgba(242,210,162,.35);
          box-shadow: 0 0 0 1px rgba(242,210,162,.18) inset;
          background: rgba(198,40,40,.12);
        }
        .character-meta strong { display:block; font-size:15px; }
        .character-meta small { color:var(--muted); }
        .dashboard-actions, .dashboard-buttons { display:flex; gap:10px; flex-wrap:wrap; }
        .dashboard-buttons { margin-top:14px; }
        .dashboard-status { font-size:13px; min-height:18px; color:var(--muted); margin-top:10px; }

        .group-list, .group-members-list, .group-characters-list { display:flex; flex-direction:column; gap:10px; }
        .group-item, .group-member-item, .group-character-item {
          display:flex; justify-content:space-between; gap:12px; align-items:center;
          padding:12px 14px; border-radius:14px; border:1px solid rgba(242,210,162,.14); background:rgba(18,10,10,.6);
        }
        .group-item.active { border-color: rgba(174, 35, 35, .65); box-shadow: 0 0 0 1px rgba(174,35,35,.25) inset; }
        .group-meta, .group-member-meta, .group-character-meta { display:flex; flex-direction:column; gap:4px; }
        .group-meta strong, .group-member-meta strong, .group-character-meta strong { color:#f6ead7; }
        .group-meta small, .group-member-meta small, .group-character-meta small { color:var(--muted); }
        .group-subgrid { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:14px; }
        .group-inline-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
        .group-select {
          width:100%; margin-top:10px; padding:10px 12px; border-radius:12px; border:1px solid rgba(242,210,162,.15);
          background:rgba(16,8,8,.86); color:#f6ead7;
        }
        .group-code-box {
          display:flex; justify-content:space-between; gap:10px; align-items:center;
          padding:10px 12px; margin-top:12px; border-radius:12px; background:rgba(35,15,15,.55); border:1px dashed rgba(242,210,162,.18);
        }
        .group-code-box code { font-size:16px; letter-spacing:2px; color:var(--gold); }
        .group-empty { color:var(--muted); font-size:13px; }
        .tiny-badge {
          display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:999px;
          background:rgba(242,210,162,.1); color:var(--gold); font-size:11px;
        }
        .hidden-section { display:none !important; }
        .app-locked .container { filter: blur(6px); pointer-events:none; user-select:none; }
        .landing-panel {
          margin-bottom: 18px;
          padding: 22px;
          border-radius: 24px;
          border: 1px solid rgba(242,210,162,.16);
          background:
            radial-gradient(circle at top right, rgba(198,40,40,.16), transparent 35%),
            linear-gradient(180deg, rgba(41,14,14,.94), rgba(17,8,8,.96));
          position: relative;
          overflow: hidden;
        }
        .landing-panel::after {
          content:"⚔️";
          position:absolute; right:18px; top:10px; font-size: clamp(48px, 10vw, 96px);
          opacity:.06; pointer-events:none;
        }
        .landing-actions { display:flex; gap:12px; flex-wrap:wrap; margin-top:18px; }
        .landing-btn-primary {
          background: linear-gradient(180deg, rgba(127,29,29,.96), rgba(83,16,16,.98));
          border-color: rgba(242,210,162,.26);
          color: var(--gold);
        }
        .landing-btn-secondary {
          background: linear-gradient(180deg, rgba(44,24,24,.96), rgba(23,12,12,.98));
        }
        .admin-list { display:grid; gap:10px; margin-top:14px; }
        .admin-item {
          display:grid;
          grid-template-columns: minmax(0, 1.4fr) auto;
          gap:12px;
          align-items:center;
          padding:12px 14px;
          border-radius:16px;
          border:1px solid rgba(242,210,162,.10);
          background:rgba(0,0,0,.16);
        }
        .admin-meta strong { display:block; }
        .admin-meta small { display:block; color:var(--muted); margin-top:3px; }
        .admin-actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
        .admin-stats { display:flex; gap:10px; flex-wrap:wrap; margin-top:12px; }
        @media (max-width: 900px) {
          .dashboard-wrap { grid-template-columns:1fr; }
        }
        @media (max-width: 760px) {
          .auth-grid { grid-template-columns:1fr; }
        }
      `;
      document.head.appendChild(style);

      const hero = document.querySelector('.hero');
      const authBar = document.createElement('div');
      authBar.className = 'auth-bar';
      authBar.innerHTML = `
        <div class="auth-user" id="authUserInfo">Nicht eingeloggt – lokal spielbar, mit Login aber servergespeichert.</div>
        <div class="auth-actions">
          <button class="utility-btn auth-btn" id="openAuthBtn">Login / Account</button>
          <button class="utility-btn auth-btn hidden" id="syncNowBtn">Jetzt speichern</button>
          <button class="utility-btn auth-btn hidden" id="logoutBtn">Logout</button>
        </div>
      `;
      hero.appendChild(authBar);

      const backdrop = document.createElement('div');
      backdrop.className = 'auth-backdrop';
      backdrop.id = 'authBackdrop';
      backdrop.innerHTML = `
        <div class="auth-modal">
          <div class="eyebrow">Abenteuer beginnt hier</div>
          <h2 style="margin-top:0">Willkommen im DnD Charakterbogen</h2>
          <p class="subtitle" style="margin-top:8px">Mit Account landen deine Heldinnen, Helden und Chaos-Goblins sicher am Server. Oder du spielst einfach lokal im Browser weiter – ganz ohne Login, ganz ohne Drama.</p>

          <div class="landing-panel" id="landingPanel">
            <h3 style="margin-top:0; color:var(--gold)">Wie willst du starten?</h3>
            <p style="margin:8px 0 0 0; color:var(--muted); line-height:1.6">Servermodus für Login, mehrere Charaktere und Sync. Lokaler Modus, wenn du einfach sofort losspielen willst und alles nur auf diesem Gerät gespeichert werden soll.</p>
            <div class="landing-actions">
              <button class="small-btn landing-btn-primary" id="showLoginChoiceBtn">Mit Login / Account starten</button>
              <button class="small-btn landing-btn-secondary" id="continueLocalBtn">Ohne Login lokal starten</button>
            </div>
          </div>

          <div class="auth-grid hidden-section" id="authLoginRegister">
            <div class="auth-card">
              <h3>Einloggen</h3>
              <p>Für bestehende Heldinnen, Helden und sonstige chaotische Wesen.</p>
              <label><span>E-Mail</span><input id="loginEmail" type="email" autocomplete="username" /></label>
              <label><span>Passwort</span><input id="loginPassword" type="password" autocomplete="current-password" /></label>
              <button class="small-btn" id="loginSubmitBtn" style="margin-top:12px">Einloggen</button>
              <div class="auth-error" id="loginError"></div>
            </div>
            <div class="auth-card">
              <h3>Neuen Account erstellen</h3>
              <p>Schnell angelegt, damit die Gruppe nicht weiter mit JSON-Dateien jongliert wie mit Wurfmessern.</p>
              <label><span>Anzeigename</span><input id="registerName" type="text" autocomplete="name" /></label>
              <label><span>E-Mail</span><input id="registerEmail" type="email" autocomplete="username" /></label>
              <label><span>Passwort</span><input id="registerPassword" type="password" autocomplete="new-password" /></label>
              <button class="small-btn" id="registerSubmitBtn" style="margin-top:12px">Account erstellen</button>
              <div class="auth-error" id="registerError"></div>
              <div class="auth-success" id="registerSuccess"></div>
            </div>
          </div>

          <div class="dashboard-wrap">
            <div class="dashboard-card" id="dashboardCharactersCard">
              <h3>Charakter-Dashboard</h3>
              <p>Hier kannst du zwischen deinen Charakteren wechseln, neue anlegen oder den aktuellen duplizieren.</p>
              <div class="character-list" id="characterList"></div>
              <div class="dashboard-status" id="dashboardStatus"></div>
            </div>
            <div class="dashboard-card" id="dashboardActionsCard">
              <h3>Aktionen</h3>
              <p>Der aktive Charakter wird automatisch gespeichert. Wechseln, duplizieren, löschen – alles hier, ganz ohne JSON-Akrobatik.</p>
              <div class="dashboard-buttons">
                <button class="small-btn" id="newCharacterBtn">Neuen Charakter</button>
                <button class="small-btn" id="duplicateCharacterBtn">Aktuellen duplizieren</button>
                <button class="small-btn" id="renameCharacterBtn">Aktuellen umbenennen</button>
                <button class="small-btn" id="deleteCharacterBtn">Aktuellen löschen</button>
              </div>
              <div class="auth-note" id="currentCharacterInfo" style="margin-top:16px">Kein Charakter geladen.</div>
              <label style="display:block; margin-top:14px">
                <span>Aktiven Charakter Spielgruppe zuweisen</span>
                <select id="characterGroupSelect" class="group-select">
                  <option value="">Keine Spielgruppe</option>
                </select>
              </label>
            </div>
            <div class="dashboard-card" id="groupsCard">
              <h3>Spielgruppen</h3>
              <p>Baue deine Runde zusammen, teile den Einladungscode und wechsle nicht mehr zwischen Zettelwirtschaft und Tavernengerüchten.</p>
              <div class="dashboard-buttons">
                <button class="small-btn" id="createGroupBtn">Neue Spielgruppe</button>
                <button class="small-btn" id="joinGroupBtn">Per Code beitreten</button>
              </div>
              <div class="group-list" id="groupList" style="margin-top:14px"></div>
              <div class="group-code-box">
                <div>
                  <div class="group-empty">Einladungscode der ausgewählten Gruppe</div>
                  <code id="selectedGroupCode">—</code>
                </div>
                <div class="group-inline-actions">
                  <button class="utility-btn auth-btn" id="copyGroupCodeBtn">Code kopieren</button>
                  <button class="utility-btn auth-btn" id="regenGroupCodeBtn">Code erneuern</button>
                </div>
              </div>
              <div class="group-subgrid">
                <div>
                  <h4 style="margin:0 0 8px 0; color:var(--gold)">Mitglieder</h4>
                  <div class="group-members-list" id="groupMembersList"></div>
                </div>
                <div>
                  <h4 style="margin:0 0 8px 0; color:var(--gold)">Charaktere der Gruppe</h4>
                  <div class="group-characters-list" id="groupCharactersList"></div>
                </div>
              </div>
              <div class="group-inline-actions">
                <button class="utility-btn auth-btn" id="leaveGroupBtn">Aus Gruppe austreten</button>
              </div>
              <div class="dashboard-status" id="groupsStatus"></div>
            </div>
            <div class="dashboard-card" id="adminUsersCard">
              <h3>Adminbereich</h3>
              <p>Benutzerübersicht für den Dungeon Master hinter den Kulissen. Hier kannst du Accounts einsehen und notfalls löschen.</p>
              <div class="admin-stats" id="adminStats"></div>
              <div class="admin-list" id="adminUserList"></div>
              <div class="dashboard-status" id="adminStatus"></div>
            </div>
          </div>

          <div class="auth-note">Hinweis: Lokaler Modus speichert nur auf diesem Gerät. Mit Login landen deine Daten am Server. Adminzugang erhält standardmäßig der erste registrierte Account.</div>
        </div>
      `;
      document.body.appendChild(backdrop);

      const $ = (id) => document.getElementById(id);
      const authEls = {
        userInfo: $('authUserInfo'),
        openBtn: $('openAuthBtn'),
        syncNowBtn: $('syncNowBtn'),
        logoutBtn: $('logoutBtn'),
        backdrop: $('authBackdrop'),
        landingPanel: $('landingPanel'),
        showLoginChoiceBtn: $('showLoginChoiceBtn'),
        continueLocalBtn: $('continueLocalBtn'),
        loginRegisterWrap: $('authLoginRegister'),
        charactersCard: $('dashboardCharactersCard'),
        actionsCard: $('dashboardActionsCard'),
        adminUsersCard: $('adminUsersCard'),
        adminStats: $('adminStats'),
        adminUserList: $('adminUserList'),
        adminStatus: $('adminStatus'),
        characterList: $('characterList'),
        dashboardStatus: $('dashboardStatus'),
        currentCharacterInfo: $('currentCharacterInfo'),
        characterGroupSelect: $('characterGroupSelect'),
        groupsCard: $('groupsCard'),
        groupList: $('groupList'),
        groupMembersList: $('groupMembersList'),
        groupCharactersList: $('groupCharactersList'),
        selectedGroupCode: $('selectedGroupCode'),
        copyGroupCodeBtn: $('copyGroupCodeBtn'),
        regenGroupCodeBtn: $('regenGroupCodeBtn'),
        leaveGroupBtn: $('leaveGroupBtn'),
        groupsStatus: $('groupsStatus'),
        createGroupBtn: $('createGroupBtn'),
        joinGroupBtn: $('joinGroupBtn'),
        newCharacterBtn: $('newCharacterBtn'),
        duplicateCharacterBtn: $('duplicateCharacterBtn'),
        renameCharacterBtn: $('renameCharacterBtn'),
        deleteCharacterBtn: $('deleteCharacterBtn'),
        loginEmail: $('loginEmail'),
        loginPassword: $('loginPassword'),
        loginSubmitBtn: $('loginSubmitBtn'),
        loginError: $('loginError'),
        registerName: $('registerName'),
        registerEmail: $('registerEmail'),
        registerPassword: $('registerPassword'),
        registerSubmitBtn: $('registerSubmitBtn'),
        registerError: $('registerError'),
        registerSuccess: $('registerSuccess')
      };

      const originalSaveCharacter = saveCharacter;

      saveCharacter = function patchedSaveCharacter() {
        originalSaveCharacter();
        if (!authState.user || !authState.currentCharacterId) return;
        clearTimeout(authState.saveTimer);
        authState.saveTimer = setTimeout(async () => {
          try {
            await saveCurrentCharacterToServer();
          } catch (error) {
            console.error('Autosave fehlgeschlagen', error);
          }
        }, 500);
      };

      function setLocked(locked) {
        document.body.classList.toggle('app-locked', locked);
        authEls.backdrop.classList.toggle('visible', locked);
      }

      function getCharacterDisplayName() {
        const localName = String(character?.name || '').trim();
        const activeMeta = authState.characters.find(item => item.id === authState.currentCharacterId);
        return localName || activeMeta?.name || 'Unbenannter Charakter';
      }

      function setDashboardStatus(text) {
        authEls.dashboardStatus.textContent = text || '';
      }

      function setAdminStatus(text) {
        authEls.adminStatus.textContent = text || '';
      }

      function setGroupsStatus(text) {
        authEls.groupsStatus.textContent = text || '';
      }

      function getCurrentCharacterGroupId() {
        const activeMeta = authState.characters.find(item => item.id === authState.currentCharacterId);
        return activeMeta?.groupId ?? null;
      }

      function getGroupNameById(groupId) {
        const group = authState.groups.find(item => item.id === groupId);
        return group?.name || null;
      }

      function showLoginForms() {
        authState.localModeChosen = false;
        authEls.landingPanel.classList.add('hidden-section');
        authEls.loginRegisterWrap.classList.remove('hidden-section');
        setLocked(true);
      }

      function continueLocalMode() {
        authState.localModeChosen = true;
        authEls.landingPanel.classList.remove('hidden-section');
        authEls.loginRegisterWrap.classList.add('hidden-section');
        setLocked(false);
        setAuthUi();
      }

      function renderAdminPanel() {
        authEls.adminStats.innerHTML = '';
        authEls.adminUserList.innerHTML = '';
        if (!authState.user?.isAdmin) return;
        authEls.adminStats.innerHTML = `
          <span class="tiny-badge">${authState.adminUsers.length} Benutzer</span>
          <span class="tiny-badge">${authState.characters.length} eigene Charaktere aktiv sichtbar</span>
        `;
        if (!authState.adminUsers.length) {
          authEls.adminUserList.innerHTML = '<div class="auth-note">Keine Benutzer gefunden.</div>';
          return;
        }
        authState.adminUsers.forEach((user) => {
          const row = document.createElement('div');
          row.className = 'admin-item';
          const created = user.createdAt ? new Date(user.createdAt).toLocaleString('de-AT') : '–';
          const updated = user.lastCharacterUpdate ? new Date(user.lastCharacterUpdate).toLocaleString('de-AT') : 'noch nie';
          row.innerHTML = `
            <div class="admin-meta">
              <strong>${escapeHtml(user.displayName || 'Unbenannt')} ${user.isAdmin ? '<span class="tiny-badge">Admin</span>' : ''}</strong>
              <small>${escapeHtml(user.email || '')}</small>
              <small>Erstellt: ${escapeHtml(created)} · Charaktere: ${escapeHtml(String(user.characterCount || 0))} · Letzter Save: ${escapeHtml(updated)}</small>
            </div>
            <div class="admin-actions">
              ${user.id === authState.user.id ? '<span class="tiny-badge">Du</span>' : `<button class="utility-btn auth-btn admin-delete-btn" data-id="${user.id}" data-name="${escapeHtml(user.displayName || user.email || 'Benutzer')}">Löschen</button>`}
            </div>
          `;
          authEls.adminUserList.appendChild(row);
        });
        authEls.adminUserList.querySelectorAll('.admin-delete-btn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = Number(btn.dataset.id);
            const name = btn.dataset.name;
            if (!confirm(`Wirklich Benutzer „${name}“ samt Charakteren löschen?`)) return;
            try {
              await fetchJson(`${API_BASE}/api/admin/users/${id}`, { method: 'DELETE' });
              setAdminStatus(`Benutzer „${name}“ gelöscht.`);
              await loadAdminUsers();
              setTimeout(() => setAdminStatus(''), 1800);
            } catch (error) {
              setAdminStatus(error.message);
            }
          });
        });
      }

      function setAuthUi() {
        if (authState.user) {
          const activeLabel = authState.currentCharacterId ? ` – aktiv: ${getCharacterDisplayName()}` : '';
          authEls.userInfo.textContent = `Eingeloggt als ${authState.user.displayName} (${authState.user.email})${activeLabel}`;
          authEls.syncNowBtn.classList.remove('hidden');
          authEls.logoutBtn.classList.remove('hidden');
          authEls.openBtn.textContent = authState.user.isAdmin ? 'Dashboard / Admin' : 'Charaktere / Account';
          authEls.landingPanel.classList.add('hidden-section');
          authEls.loginRegisterWrap.classList.add('hidden-section');
          authEls.charactersCard.classList.add('visible');
          authEls.actionsCard.classList.add('visible');
          authEls.groupsCard.classList.add('visible');
          authEls.adminUsersCard.classList.toggle('visible', !!authState.user.isAdmin);
          const currentGroupName = getGroupNameById(getCurrentCharacterGroupId());
          authEls.currentCharacterInfo.textContent = `Aktiv: ${getCharacterDisplayName()}${currentGroupName ? ` · Gruppe: ${currentGroupName}` : ''}`;
        } else {
          authEls.userInfo.textContent = authState.localModeChosen
            ? 'Lokaler Modus aktiv – Speicherung nur in diesem Browser.'
            : 'Nicht eingeloggt – lokal spielbar, mit Login aber servergespeichert.';
          authEls.syncNowBtn.classList.add('hidden');
          authEls.logoutBtn.classList.add('hidden');
          authEls.openBtn.textContent = 'Login / Account';
          authEls.landingPanel.classList.remove('hidden-section');
          authEls.loginRegisterWrap.classList.add('hidden-section');
          authEls.charactersCard.classList.remove('visible');
          authEls.actionsCard.classList.remove('visible');
          authEls.groupsCard.classList.remove('visible');
          authEls.adminUsersCard.classList.remove('visible');
          authEls.currentCharacterInfo.textContent = 'Kein Charakter geladen.';
        }
        renderAdminPanel();
      }

      async function fetchJson(url, options = {}) {
        const response = await fetch(url, { credentials: 'include', ...options });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Anfrage fehlgeschlagen.');
        return payload;
      }

      async function refreshCharactersList() {
        if (!authState.user) return;
        const payload = await fetchJson(`${API_BASE}/api/characters`);
        authState.characters = payload.characters || [];
        authState.currentCharacterId = payload.activeCharacterId || authState.currentCharacterId;
        renderCharacterList();
        renderCharacterGroupSelect();
        setAuthUi();
      }

      async function loadAdminUsers() {
        if (!authState.user?.isAdmin) {
          authState.adminUsers = [];
          renderAdminPanel();
          return;
        }
        const payload = await fetchJson(`${API_BASE}/api/admin/users`);
        authState.adminUsers = payload.users || [];
        renderAdminPanel();
      }


      async function loadGroups() {
        if (!authState.user) {
          authState.groups = [];
          authState.selectedGroupId = null;
          authState.selectedGroupDetails = null;
          renderGroupsPanel();
          renderCharacterGroupSelect();
          return;
        }
        const payload = await fetchJson(`${API_BASE}/api/groups`);
        authState.groups = payload.groups || [];
        if (authState.selectedGroupId && !authState.groups.some(g => g.id === authState.selectedGroupId)) {
          authState.selectedGroupId = null;
          authState.selectedGroupDetails = null;
        }
        if (!authState.selectedGroupId && authState.groups.length) {
          authState.selectedGroupId = authState.groups[0].id;
        }
        if (authState.selectedGroupId) {
          await loadSelectedGroupDetails();
        } else {
          authState.selectedGroupDetails = null;
        }
        renderGroupsPanel();
        renderCharacterGroupSelect();
      }

      async function loadSelectedGroupDetails() {
        if (!authState.user || !authState.selectedGroupId) {
          authState.selectedGroupDetails = null;
          renderGroupsPanel();
          return;
        }
        const payload = await fetchJson(`${API_BASE}/api/groups/${authState.selectedGroupId}`);
        authState.selectedGroupDetails = payload;
        renderGroupsPanel();
      }

      function renderCharacterGroupSelect() {
        if (!authEls.characterGroupSelect) return;
        const current = getCurrentCharacterGroupId();
        authEls.characterGroupSelect.innerHTML = `<option value="">Keine Spielgruppe</option>` + authState.groups.map(group => (
          `<option value="${group.id}" ${Number(current) === Number(group.id) ? 'selected' : ''}>${escapeHtml(group.name)}</option>`
        )).join('');
      }

      function renderGroupsPanel() {
        authEls.groupList.innerHTML = '';
        authEls.groupMembersList.innerHTML = '';
        authEls.groupCharactersList.innerHTML = '';
        const selected = authState.groups.find(group => group.id === authState.selectedGroupId) || null;
        authEls.selectedGroupCode.textContent = selected?.inviteCode || '—';
        authEls.regenGroupCodeBtn.style.display = selected && selected.role === 'owner' ? 'inline-flex' : 'none';
        authEls.copyGroupCodeBtn.style.display = selected ? 'inline-flex' : 'inline-flex';
        authEls.leaveGroupBtn.style.display = selected ? 'inline-flex' : 'none';

        if (!authState.groups.length) {
          authEls.groupList.innerHTML = `<div class="auth-note">Du bist noch in keiner Spielgruppe. Zeit, die Taverne zu eröffnen.</div>`;
          authEls.groupMembersList.innerHTML = `<div class="group-empty">Noch keine Gruppe ausgewählt.</div>`;
          authEls.groupCharactersList.innerHTML = `<div class="group-empty">Noch keine Gruppe ausgewählt.</div>`;
          return;
        }

        authState.groups.forEach((group) => {
          const item = document.createElement('div');
          item.className = `group-item${group.id === authState.selectedGroupId ? ' active' : ''}`;
          item.innerHTML = `
            <div class="group-meta">
              <strong>${escapeHtml(group.name)}</strong>
              <small>${group.role === 'owner' ? 'Spielleitung / Besitzer' : 'Mitglied'} · ${escapeHtml(String(group.memberCount || 0))} Mitglieder · ${escapeHtml(String(group.characterCount || 0))} Charaktere</small>
            </div>
            <div class="dashboard-actions">
              ${group.id === authState.selectedGroupId ? '<span class="tiny-badge">Ausgewählt</span>' : `<button class="utility-btn auth-btn select-group-btn" data-id="${group.id}">Öffnen</button>`}
            </div>
          `;
          authEls.groupList.appendChild(item);
        });

        authEls.groupList.querySelectorAll('.select-group-btn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            authState.selectedGroupId = Number(btn.dataset.id);
            await loadSelectedGroupDetails();
            renderGroupsPanel();
          });
        });

        const details = authState.selectedGroupDetails;
        if (!details || !selected) {
          authEls.groupMembersList.innerHTML = `<div class="group-empty">Gruppe wird geladen …</div>`;
          authEls.groupCharactersList.innerHTML = `<div class="group-empty">Gruppe wird geladen …</div>`;
          return;
        }

        if (!(details.members || []).length) {
          authEls.groupMembersList.innerHTML = `<div class="group-empty">Noch keine Mitglieder.</div>`;
        } else {
          authEls.groupMembersList.innerHTML = details.members.map((member) => `
            <div class="group-member-item">
              <div class="group-member-meta">
                <strong>${escapeHtml(member.displayName)} ${member.role === 'owner' ? '<span class="tiny-badge">Owner</span>' : ''}</strong>
                <small>${escapeHtml(member.email || '')}</small>
                <small>${escapeHtml(String(member.characterCount || 0))} Charaktere in dieser Gruppe</small>
              </div>
            </div>
          `).join('');
        }

        if (!(details.characters || []).length) {
          authEls.groupCharactersList.innerHTML = `<div class="group-empty">Noch keine Charaktere dieser Gruppe zugewiesen.</div>`;
        } else {
          authEls.groupCharactersList.innerHTML = details.characters.map((entry) => `
            <div class="group-character-item">
              <div class="group-character-meta">
                <strong>${escapeHtml(entry.name || 'Unbenannter Charakter')}</strong>
                <small>von ${escapeHtml(entry.ownerName || 'Unbekannt')}</small>
              </div>
            </div>
          `).join('');
        }
      }

      async function createGroup() {
        const name = prompt('Name für die Spielgruppe:', 'Meine Heldengruppe');
        if (!name) return;
        const payload = await fetchJson(`${API_BASE}/api/groups`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim() })
        });
        authState.selectedGroupId = payload.group.id;
        await loadGroups();
        setGroupsStatus(`Spielgruppe „${name.trim()}“ erstellt.`);
        setTimeout(() => setGroupsStatus(''), 1800);
      }

      async function joinGroup() {
        const inviteCode = prompt('Einladungscode eingeben:');
        if (!inviteCode) return;
        const payload = await fetchJson(`${API_BASE}/api/groups/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inviteCode: inviteCode.trim() })
        });
        authState.selectedGroupId = payload.group.id;
        await loadGroups();
        setGroupsStatus(`Du bist der Gruppe „${payload.group.name}“ beigetreten.`);
        setTimeout(() => setGroupsStatus(''), 2000);
      }

      async function assignCurrentCharacterGroup(groupIdValue) {
        if (!authState.user || !authState.currentCharacterId) return;
        const groupId = groupIdValue ? Number(groupIdValue) : null;
        await fetchJson(`${API_BASE}/api/characters/${authState.currentCharacterId}/group`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupId })
        });
        await refreshCharactersList();
        await loadGroups();
        setAuthUi();
        setGroupsStatus(groupId ? `Aktiver Charakter wurde der Gruppe „${getGroupNameById(groupId) || 'Unbekannt'}“ zugewiesen.` : 'Aktiver Charakter wurde aus der Spielgruppe entfernt.');
        setTimeout(() => setGroupsStatus(''), 1800);
      }

      async function copyGroupCode() {
        const selected = authState.groups.find(group => group.id === authState.selectedGroupId);
        if (!selected?.inviteCode) return;
        try {
          await navigator.clipboard.writeText(selected.inviteCode);
          setGroupsStatus('Einladungscode kopiert.');
          setTimeout(() => setGroupsStatus(''), 1400);
        } catch (_error) {
          setGroupsStatus(`Code: ${selected.inviteCode}`);
        }
      }

      async function regenerateGroupCode() {
        if (!authState.selectedGroupId) return;
        const selected = authState.groups.find(group => group.id === authState.selectedGroupId);
        if (!selected || selected.role !== 'owner') return;
        const payload = await fetchJson(`${API_BASE}/api/groups/${authState.selectedGroupId}/regenerate-code`, {
          method: 'POST'
        });
        await loadGroups();
        setGroupsStatus(`Neuer Einladungscode: ${payload.inviteCode}`);
      }

      async function leaveSelectedGroup() {
        if (!authState.selectedGroupId) return;
        const selected = authState.groups.find(group => group.id === authState.selectedGroupId);
        if (!selected) return;
        if (!confirm(`Wirklich die Spielgruppe „${selected.name}“ verlassen? Eigene Charaktere werden dabei aus der Gruppe gelöst.`)) return;
        await fetchJson(`${API_BASE}/api/groups/${authState.selectedGroupId}/leave`, { method: 'POST' });
        authState.selectedGroupId = null;
        await refreshCharactersList();
        await loadGroups();
        setAuthUi();
        setGroupsStatus(`Du hast „${selected.name}“ verlassen.`);
        setTimeout(() => setGroupsStatus(''), 1800);
      }

      function renderCharacterList() {
        const activeId = authState.currentCharacterId;
        authEls.characterList.innerHTML = '';
        if (!authState.characters.length) {
          authEls.characterList.innerHTML = `<div class="auth-note">Noch keine Charaktere vorhanden.</div>`;
          return;
        }

        authState.characters.forEach((entry) => {
          const item = document.createElement('div');
          item.className = `character-item${entry.id === activeId ? ' active' : ''}`;
          const updated = entry.updatedAt ? new Date(entry.updatedAt).toLocaleString('de-AT') : '–';
          item.innerHTML = `
            <div class="character-meta">
              <strong>${escapeHtml(entry.name || 'Unbenannter Charakter')}</strong>
              <small>Zuletzt gespeichert: ${escapeHtml(updated)}</small>
            </div>
            <div class="dashboard-actions">
              ${entry.id === activeId ? '<span class="tiny-badge">Aktiv</span>' : `<button class="utility-btn auth-btn switch-btn" data-id="${entry.id}">Laden</button>`}
            </div>
          `;
          authEls.characterList.appendChild(item);
        });

        authEls.characterList.querySelectorAll('.switch-btn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = Number(btn.dataset.id);
            try {
              setDashboardStatus('Charakter wird geladen …');
              await switchCharacter(id);
              setDashboardStatus('Charakter geladen.');
              setTimeout(() => setDashboardStatus(''), 1500);
            } catch (error) {
              setDashboardStatus(error.message);
            }
          });
        });
      }

      async function loadActiveCharacterFromServer() {
        const payload = await fetchJson(`${API_BASE}/api/character`);
        authState.currentCharacterId = payload.activeCharacterId || null;
        character = mergeCharacter(payload.character || {});
        if (payload.name && !String(character.name || '').trim()) character.name = payload.name;
        updateDerivedValues();
        originalSaveCharacter();
        render();
      }

      async function switchCharacter(characterId) {
        await fetchJson(`${API_BASE}/api/characters/${characterId}/activate`, { method: 'POST' });
        const payload = await fetchJson(`${API_BASE}/api/characters/${characterId}`);
        authState.currentCharacterId = characterId;
        character = mergeCharacter(payload.character || {});
        if (payload.meta?.name && !String(character.name || '').trim()) character.name = payload.meta.name;
        updateDerivedValues();
        originalSaveCharacter();
        render();
        await refreshCharactersList();
      }

      async function saveCurrentCharacterToServer() {
        if (!authState.user || !authState.currentCharacterId) return;
        const name = String(character?.name || '').trim() || getCharacterDisplayName();
        await fetchJson(`${API_BASE}/api/characters/${authState.currentCharacterId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ character, name })
        });
        await refreshCharactersList();
      }

      async function pushCharacterNow() {
        if (!authState.user) return;
        if (authState.currentCharacterId) {
          await saveCurrentCharacterToServer();
          return;
        }
        await fetchJson(`${API_BASE}/api/character`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ character, name: String(character?.name || '').trim() || 'Mein Charakter' })
        });
        await refreshCharactersList();
      }

      async function loadSession() {
        try {
          const payload = await fetchJson(`${API_BASE}/api/me`);
          authState.user = payload.user;
          authState.localModeChosen = true;
          await refreshCharactersList();
          await loadActiveCharacterFromServer();
          await loadGroups();
          await loadAdminUsers();
          setAuthUi();
          setLocked(false);
        } catch (error) {
          authState.user = null;
          authState.currentCharacterId = null;
          authState.characters = [];
          authState.adminUsers = [];
          authState.groups = [];
          authState.selectedGroupId = null;
          authState.selectedGroupDetails = null;
          setAuthUi();
          if (!authState.localModeChosen) setLocked(true);
        }
      }

      async function register() {
        authEls.registerError.textContent = '';
        authEls.registerSuccess.textContent = '';
        try {
          const payload = await fetchJson(`${API_BASE}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              displayName: authEls.registerName.value.trim(),
              email: authEls.registerEmail.value.trim(),
              password: authEls.registerPassword.value,
              initialCharacter: character
            })
          });
          authState.user = payload.user;
          authState.localModeChosen = true;
          await refreshCharactersList();
          await loadActiveCharacterFromServer();
          await loadGroups();
          await loadAdminUsers();
          authEls.registerSuccess.textContent = 'Account erstellt und dein aktueller Charakter wurde als erster Held gespeichert.';
          setAuthUi();
          setLocked(false);
        } catch (error) {
          authEls.registerError.textContent = error.message;
        }
      }

      async function login() {
        authEls.loginError.textContent = '';
        try {
          const payload = await fetchJson(`${API_BASE}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: authEls.loginEmail.value.trim(),
              password: authEls.loginPassword.value
            })
          });
          authState.user = payload.user;
          authState.localModeChosen = true;
          await refreshCharactersList();
          await loadActiveCharacterFromServer();
          await loadGroups();
          await loadAdminUsers();
          setAuthUi();
          setLocked(false);
        } catch (error) {
          authEls.loginError.textContent = error.message;
        }
      }

      async function logout() {
        try {
          await fetchJson(`${API_BASE}/api/logout`, { method: 'POST' });
        } finally {
          authState.user = null;
          authState.currentCharacterId = null;
          authState.characters = [];
          authState.adminUsers = [];
          authState.groups = [];
          authState.selectedGroupId = null;
          authState.selectedGroupDetails = null;
          authState.localModeChosen = false;
          setAuthUi();
          setLocked(true);
        }
      }

      async function createCharacter(mode) {
        if (!authState.user) return;
        const defaultName = mode === 'duplicate'
          ? `${getCharacterDisplayName()} Kopie`
          : 'Neuer Charakter';
        const chosenName = prompt('Name für den Charakter:', defaultName);
        if (!chosenName) return;
        const payload = await fetchJson(`${API_BASE}/api/characters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode,
            name: chosenName.trim(),
            sourceCharacterId: authState.currentCharacterId,
            payload: mode === 'blank' ? {} : undefined
          })
        });
        await switchCharacter(payload.character.id);
        setDashboardStatus(`Charakter „${chosenName.trim()}“ erstellt.`);
        setTimeout(() => setDashboardStatus(''), 1800);
      }

      async function renameCharacter() {
        if (!authState.user || !authState.currentCharacterId) return;
        const newName = prompt('Neuer Name für den aktuellen Charakter:', getCharacterDisplayName());
        if (!newName) return;
        character.name = newName.trim();
        updateDerivedValues();
        originalSaveCharacter();
        render();
        await saveCurrentCharacterToServer();
        setDashboardStatus('Charakter umbenannt.');
        setTimeout(() => setDashboardStatus(''), 1800);
      }

      async function deleteCurrentCharacter() {
        if (!authState.user || !authState.currentCharacterId) return;
        const currentName = getCharacterDisplayName();
        if (!confirm(`Wirklich „${currentName}“ löschen?`)) return;
        await fetchJson(`${API_BASE}/api/characters/${authState.currentCharacterId}`, { method: 'DELETE' });
        await refreshCharactersList();
        await loadActiveCharacterFromServer();
        setDashboardStatus(`„${currentName}“ wurde gelöscht.`);
        setTimeout(() => setDashboardStatus(''), 1800);
      }

      authEls.openBtn.addEventListener('click', () => {
        if (authState.user) {
          authEls.landingPanel.classList.add('hidden-section');
          authEls.loginRegisterWrap.classList.add('hidden-section');
        } else if (authState.localModeChosen) {
          authEls.landingPanel.classList.remove('hidden-section');
          authEls.loginRegisterWrap.classList.add('hidden-section');
        }
        setLocked(true);
      });
      authEls.showLoginChoiceBtn.addEventListener('click', showLoginForms);
      authEls.continueLocalBtn.addEventListener('click', continueLocalMode);
      authEls.backdrop.addEventListener('click', (event) => {
        if (event.target !== authEls.backdrop) return;
        if (!authState.user && !authState.localModeChosen) return;
        setLocked(false);
      });
      authEls.loginSubmitBtn.addEventListener('click', login);
      authEls.registerSubmitBtn.addEventListener('click', register);
      authEls.logoutBtn.addEventListener('click', logout);
      authEls.newCharacterBtn.addEventListener('click', () => createCharacter('blank'));
      authEls.duplicateCharacterBtn.addEventListener('click', () => createCharacter('duplicate'));
      authEls.renameCharacterBtn.addEventListener('click', renameCharacter);
      authEls.deleteCharacterBtn.addEventListener('click', deleteCurrentCharacter);
      authEls.syncNowBtn.addEventListener('click', async () => {
        try {
          await pushCharacterNow();
          authEls.userInfo.textContent = `Eingeloggt als ${authState.user.displayName} (${authState.user.email}) – gerade gespeichert.`;
          setTimeout(setAuthUi, 1800);
        } catch (error) {
          console.error(error);
          authEls.userInfo.textContent = 'Speichern fehlgeschlagen.';
          setTimeout(setAuthUi, 1800);
        }
      });

      authEls.characterGroupSelect.addEventListener('change', async (event) => {
        try {
          await assignCurrentCharacterGroup(event.target.value);
        } catch (error) {
          setGroupsStatus(error.message);
        }
      });
      authEls.createGroupBtn.addEventListener('click', async () => {
        try {
          await createGroup();
        } catch (error) {
          setGroupsStatus(error.message);
        }
      });
      authEls.joinGroupBtn.addEventListener('click', async () => {
        try {
          await joinGroup();
        } catch (error) {
          setGroupsStatus(error.message);
        }
      });
      authEls.copyGroupCodeBtn.addEventListener('click', copyGroupCode);
      authEls.regenGroupCodeBtn.addEventListener('click', async () => {
        try {
          await regenerateGroupCode();
        } catch (error) {
          setGroupsStatus(error.message);
        }
      });
      authEls.leaveGroupBtn.addEventListener('click', async () => {
        try {
          await leaveSelectedGroup();
        } catch (error) {
          setGroupsStatus(error.message);
        }
      });

      setAuthUi();
      if (!authState.user && !authState.localModeChosen) setLocked(true);
      loadSession();
    })();