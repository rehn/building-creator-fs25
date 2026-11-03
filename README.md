# House to i3d

Build houses for Farming Simulator 25 in the browser and export them as `.i3d` (zipped with textures) to finish in Giants Editor. Each house is saved to your account, so you can come back and change it later. Accounts are invite only.

```
backend/    Go API: accounts, invites, projects (SQLite)
frontend/   Next.js app: login, "My houses", the 3D editor
docker-compose.yml
.github/workflows/ci.yml
```

## How it fits together

The browser only talks to the Next.js app. Everything under `/api/` is forwarded to the Go API, which isn't exposed to the internet. That keeps the session cookie same-origin and simple.

```
browser ──► web (Next.js, port 3000) ──/api/*──► api (Go, port 8080) ──► SQLite in the "data" volume
```

The editor itself runs in the browser. `frontend/src/editor/model.mjs` holds the house logic (settings, geometry, i3d export) with no DOM or three.js, so it can be tested in Node. `editor.mjs` adds the controls and the 3D preview.

## Run it

You need Docker. Copy the settings file and fill it in:

```sh
cp .env.example .env
```

Set at least `ADMIN_EMAIL` to your own address. Then:

```sh
docker compose up -d --build
```

Open http://localhost:3000, click **Create the admin account** and sign up with the `ADMIN_EMAIL` address. The database lives in the `data` volume, so it survives restarts and upgrades.

To run the images from Docker Hub instead of building, set `DOCKERHUB_USERNAME` and `TAG` in `.env` and run `docker compose pull && docker compose up -d`.

### Inviting friends

As the admin, open **Invites**, enter a friend's email and send them the link. It works once, for that address, for 14 days. They can sign up with a password, or with Google if it's set up and the Google account has the same email.

### Sign in with Google (optional)

1. In the [Google Cloud console](https://console.cloud.google.com/apis/credentials), create an **OAuth client ID** of type **Web application**.
2. Under **Authorized redirect URIs**, add `PUBLIC_URL` + `/api/auth/google/callback`, for example `http://localhost:3000/api/auth/google/callback` and later your real address.
3. Put the client ID and secret in `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then `docker compose up -d`.

The Google button only shows up when both are set.

### Going online

Put the `web` service behind a reverse proxy with HTTPS (Caddy, Traefik, nginx) and set `PUBLIC_URL` to the https address. Cookies are then marked Secure automatically. Open the app at exactly `PUBLIC_URL`: requests from any other origin are rejected as a CSRF protection.

## Develop

With Go 1.25+ and Node 22+ installed, start everything with one command:

```sh
./dev.sh            # API on :8080, app on http://localhost:3000, Ctrl+C stops both
./dev.sh --reset    # same, but delete the local database first
```

The first run creates `.env` with your git email as `ADMIN_EMAIL`. The local database lives in `.dev/`, which git ignores.

Or start the two parts yourself:

```sh
# terminal 1
cd backend
PUBLIC_URL=http://localhost:3000 ADMIN_EMAIL=you@example.se DATABASE_PATH=./dev.db go run ./cmd/server

# terminal 2
cd frontend
npm install
npm run dev
```

## Tests (TDD)

Write the failing test first, make it pass, then tidy up.

```sh
cd backend && go test ./...     # API, database, passwords, config
cd frontend && npm test         # house model, i3d export, file names, API proxy
```

No Go or Node on your machine? Run them in Docker:

```sh
docker run --rm -v "$PWD/backend:/src" -w /src golang:1.25-alpine sh -c "go mod tidy && go test ./..."
docker run --rm -v "$PWD/frontend:/app" -w /app node:22-alpine sh -c "npm install && npm test"
```

What the tests cover:

- **backend/internal/api**: signing up (admin without invite, everyone else with one), invites that only work once and only for their email, login and logout, rate limiting, Google sign-in against a fake Google, project create/read/update/delete, version conflicts between tabs, users not seeing each other's houses, and cross-site requests being refused.
- **backend/internal/store**: the SQLite layer, including expiry of sessions and invites.
- **frontend/test**: settings validation, window generation, valid geometry for every roof type, closed collision for walls, roof, dormers, chimney and entrance, placement areas (leveling, clear, test, tip occlusion), i3d output, export file names and the API proxy.

## Lock files

The first time, create the lock files and commit them so builds are repeatable:

```sh
cd backend && go mod tidy          # creates go.sum
cd frontend && npm install         # creates package-lock.json
```

Or with Docker, as in the test commands above. CI and the Dockerfiles also work without them, but then each build resolves dependencies again.

## CI/CD and releases

`.github/workflows/ci.yml` runs on every pull request and push:

| Event | Tests | Docker Hub |
|---|---|---|
| Pull request to `main` | Go and frontend tests, Next.js build | Images built, not pushed |
| Push to `main` | Same | `house-to-i3d-api:edge`, `house-to-i3d-web:edge` |
| Release `v1.2.3` published | Same | `1.2.3`, `1.2`, `1` and `latest` for both images |

Images are only built after all tests pass, for `linux/amd64` and `linux/arm64`.

One-time setup in the GitHub repo, under Settings → Secrets and variables → Actions:

- Variable `DOCKERHUB_USERNAME`: your Docker Hub username.
- Secret `DOCKERHUB_TOKEN`: a Docker Hub access token with Read & Write access.

To release, publish a GitHub release with a tag like `v1.0.0`, for example with `gh release create v1.0.0 --generate-notes`.

## Configuration

| Variable | Service | Default | Meaning |
|---|---|---|---|
| `PUBLIC_URL` | api | required | The address people open, without a trailing slash |
| `ADMIN_EMAIL` | api | | Can sign up without an invite and becomes admin |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | api | | Turn on Sign in with Google |
| `DATABASE_PATH` | api | `/data/house-to-i3d.db` | SQLite file |
| `LISTEN_ADDR` | api | `:8080` | |
| `TRUST_PROXY` | api | `false` | Use `X-Forwarded-For` for rate limiting. Set `true` only when the API is reachable through the web app alone, as in docker-compose |
| `API_URL` | web | `http://api:8080` | Where the web app finds the API |

## Backups

Everything is in one SQLite file in the `data` volume. To copy it out:

```sh
docker compose cp api:/data/house-to-i3d.db ./backup.db
```

Stop the stack first (`docker compose stop api`) for a copy that's guaranteed consistent.
