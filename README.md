# jrjr-drive

A lightweight, self-hosted **Dropbox file portal** — like AList / Filestash, but
focused solely on Dropbox as the storage backend. Designed to run comfortably on
a small VPS with limited RAM.

Dropbox stays the **source of truth**: jrjr-drive never mirrors or indexes your
files. Folder listings are fetched on demand, and only thumbnails/previews are
cached locally (under `./data/previews`).

## Features

- 🔐 Admin login (username/password from environment variables)
- 📂 Browse Dropbox folders and files on demand
- ⬆️ Upload files of any size — small files in one request, large files via
  streaming chunked upload sessions — with a live progress bar
- ⬇️ Download via temporary Dropbox links, so file bytes bypass the VPS
- ✏️ Rename, 🗑️ delete, 📁 create folders
- 🔗 Public share links with random tokens, optional password and optional
  expiry — stored in SQLite
- ✍️ Share **downloads** use signed, short-lived URLs (5-minute HMAC
  signatures), minted fresh per click
- 🚦 Per-IP rate limiting on public share pages and downloads, with counters
  persisted in SQLite
- 👁️ Previews for images (`jpg jpeg png gif webp svg`), PDFs, native video
  playback, and **server-generated PSD thumbnails**
- 💾 Generated previews cached in `./data/previews` (populated on first request)
- 🪟 **WebDAV** endpoint at `/dav` so Windows can mount it as a network drive

## Tech stack

Next.js (App Router) · TypeScript · Tailwind CSS · SQLite (`better-sqlite3`) ·
Dropbox API (via `fetch`, no SDK) · `sharp` + `ag-psd` for PSD previews · Docker.

A small custom Node server (`server.js`) wraps Next.js and additionally serves
the WebDAV endpoint, since Next.js route handlers cannot handle WebDAV's
non-standard HTTP methods.

## Prerequisites

1. A **Dropbox app** — create one at <https://www.dropbox.com/developers/apps>.
   - Choose *Scoped access* and either *App folder* or *Full Dropbox* access.
   - Under **Permissions**, enable: `files.metadata.read`,
     `files.content.read`, `files.content.write`. Submit the changes.
2. Note the **App key** and **App secret** from the *Settings* tab.

### Getting a refresh token

The portal uses a long-lived refresh token so it never needs interactive login.

1. Open this URL in a browser (replace `<APP_KEY>`):

   ```
   https://www.dropbox.com/oauth2/authorize?client_id=<APP_KEY>&response_type=code&token_access_type=offline
   ```

2. Approve access and copy the displayed authorization `code`.
3. Exchange it for a refresh token (replace the placeholders):

   ```bash
   curl https://api.dropbox.com/oauth2/token \
     -d code=<AUTH_CODE> \
     -d grant_type=authorization_code \
     -u <APP_KEY>:<APP_SECRET>
   ```

4. The JSON response contains `"refresh_token"` — use it for
   `DROPBOX_REFRESH_TOKEN`.

## Configuration

Copy `.env.example` to `.env` and fill it in:

| Variable                | Description                                         |
|-------------------------|-----------------------------------------------------|
| `ADMIN_USER`            | Username for the web UI **and** WebDAV              |
| `ADMIN_PASSWORD`        | Password for the web UI **and** WebDAV              |
| `DROPBOX_APP_KEY`       | Dropbox app key                                     |
| `DROPBOX_APP_SECRET`    | Dropbox app secret                                  |
| `DROPBOX_REFRESH_TOKEN` | Dropbox refresh token (see above)                   |
| `APP_URL`               | Public URL — used to build share links              |
| `DATABASE_URL`          | SQLite path, e.g. `file:./data/app.db`              |
| `PORT`                  | Port the Node server listens on (default `3000`)    |

## Running with Docker (recommended)

```bash
cp .env.example .env      # then edit .env
docker compose up -d --build
```

The app listens on `127.0.0.1:3000` and persists `./data` (SQLite database +
cached previews) via a bind mount. A `512m` memory limit is set in
`docker-compose.yml` — adjust to taste.

## Running locally (without Docker)

Requires Node.js 22+.

```bash
npm install
npm run build
npm start          # production server on $PORT (default 3000)
# or, for development:
npm run dev
```

## Behind nginx

Run jrjr-drive bound to localhost and let nginx terminate TLS:

```nginx
server {
    listen 443 ssl;
    server_name jrjr.online;

    # ssl_certificate / ssl_certificate_key ...

    client_max_body_size 0;      # allow large uploads (0 = no cap)

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Required for WebDAV methods to pass through to /dav:
        proxy_pass_request_headers on;
        proxy_buffering off;
    }
}
```

## Mounting as a Windows network drive (WebDAV)

The WebDAV endpoint lives at `https://jrjr.online/dav` and authenticates with
the **same admin username/password**.

In Windows Explorer → *Map network drive* → enter:

```
https://jrjr.online/dav
```

Tick *Connect using different credentials* and enter `ADMIN_USER` /
`ADMIN_PASSWORD`. WebDAV over HTTPS is strongly recommended (Windows restricts
Basic auth over plain HTTP).

## Notes & limits

- **Uploads** support files of any size:
  - Files **≤ 150 MB** use a single Dropbox `files/upload` request.
  - Larger files (and any upload with no declared `Content-Length`) are sent
    via a Dropbox **upload session** — `upload_session/start` →
    `append_v2` → `finish` — streamed in **8 MB chunks**. The request body is
    never fully buffered, so memory use stays around ~20 MB regardless of file
    size. WebDAV `PUT` streams the same way.
  - When uploading behind nginx, set `client_max_body_size` high enough (or
    `0` to disable the cap) for the largest files you expect.
- **Previews** are generated lazily and cached in `./data/previews`. PSD files
  are decoded with `ag-psd` and re-encoded to JPEG with `sharp`; image
  thumbnails are rendered by Dropbox itself to keep CPU/RAM usage low.
- No background indexing or sync — every listing is an on-demand Dropbox call.
- Share-link passwords are hashed with scrypt; only hashes are stored in SQLite.
- **Signed downloads** — public download URLs carry an HMAC signature that
  binds the share token + file path + an expiry timestamp, and are valid for
  only 5 minutes. The web UI mints a fresh signed URL each time *Download* is
  clicked, so links cannot be forwarded for long-term direct access. Inline
  media (video/PDF) streams via a separate password-gated endpoint.
- **Rate limiting** — public share access is rate limited per client IP, with
  fixed-window counters stored in SQLite (one row per client, pruned
  automatically). Defaults: 60 share-page views/min, 120 browse API calls/min,
  30 downloads/min. API responses past the limit return HTTP `429` with a
  `Retry-After` header. For correct per-IP limiting, ensure nginx forwards
  `X-Forwarded-For` (the sample config above does). It uses only Node's
  built-in `crypto` and SQLite — no extra dependencies.

## Project layout

```
server.js              Custom Node server (Next.js + WebDAV)
webdav.js              WebDAV protocol translator for /dav
src/app/               Next.js App Router pages + API routes
src/components/        React UI (login, file browser, public share page)
src/lib/               Config, auth, SQLite, Dropbox client, previews
data/                  SQLite database + cached previews (gitignored)
```
