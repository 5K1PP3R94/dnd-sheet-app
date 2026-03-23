
# DnD Charakterbogen – Server-Version

Deine aktuelle HTML-Version wurde als Browser-Frontend übernommen und um Login, Registrierung und Serverspeicherung erweitert.

## Enthalten
- **dein bestehender Charakterbogen** als `public/index.html`
- **Node/Express-Backend** mit Login
- **SQLite-Datenbank** pro Nutzerkonto
- **Autosave** auf den Server nach Login
- **Docker Compose** für direkten Start
- **optionale Traefik-Compose** für Domain/HTTPS

## Schnellstart lokal oder am Server

```bash
cd dnd-sheet-app
# in docker-compose.yml unbedingt JWT_SECRET ändern
docker compose up -d --build
```

Danach im Browser:

```text
http://DEINE-SERVER-IP:3000
```

## Erste Schritte
1. `docker-compose.yml` öffnen
2. `JWT_SECRET` auf einen langen Zufallswert ändern
3. Stack starten
4. Seite öffnen
5. Für jede Person einen Account anlegen
6. Nach Login wird der aktuelle Charakter automatisch serverseitig gespeichert

## Dateien
- `docker-compose.yml` → einfacher Direktstart mit Port 3000
- `docker-compose.traefik.yml` → wenn du bereits Traefik + Domain nutzt
- `server.js` → API + SQLite + Login
- `public/index.html` → dein Charakterbogen mit Login-Overlay

## Wichtige Hinweise
- Aktuell speichert **jeder Account genau einen Charakterbogen**.
- Ohne Login läuft der Bogen weiter lokal im Browser.
- Mit Login wird serverseitig gespeichert.
- Für echtes HTTPS hinter Reverse Proxy bitte `secure`-Cookie später aktivieren.

## Nächster sinnvoller Ausbau
- mehrere Charaktere pro Account
- Admin-Ansicht für Spielleiter
- Freigabelinks für Gruppenmitglieder
- echtes Passwort-zurücksetzen
- HTTPS/Domain sauber fertig konfigurieren
