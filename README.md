# House to i3d

Build houses for Farming Simulator 25 in the browser and export them as `.i3d` (zipped with textures) to finish in Giants Editor, or as a ready-made game mod. Each house is saved to your account, so you can come back and change it later. Accounts are invite only.

```
backend/    Go API: accounts, invites, projects (SQLite or Postgres)
frontend/   Next.js app: login, "My houses", the 3D editor
charts/     Helm chart for Kubernetes, and its tests
docker-compose.yml
.github/workflows/ci.yml
```

## How it fits together

The browser only talks to the Next.js app. Everything under `/api/` is forwarded to the Go API, which isn't exposed to the internet. That keeps the session cookie same-origin and simple.

```
browser ──► web (Next.js, port 3000) ──/api/*──► api (Go, port 8080) ──► SQLite in the "data" volume, or Postgres
```

Each house is one row in the database: its name, a thumbnail, and every setting from the editor as one JSON document (windows, dormers, rooms, curtains and the game mod details included). The editor saves about a second after each change.

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

As the admin, open **Admin**, enter a friend's email and send them the link. It works once, for that address, for 14 days. They can sign up with a password, or with Google if it's set up and the Google account has the same email.

### Sign in with Google (optional)

1. In the [Google Cloud console](https://console.cloud.google.com/apis/credentials), create an **OAuth client ID** of type **Web application**.
2. Under **Authorized redirect URIs**, add `PUBLIC_URL` + `/api/auth/google/callback`, for example `http://localhost:3000/api/auth/google/callback` and later your real address.
3. Put the client ID and secret in `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then `docker compose up -d`.

The Google button only shows up when both are set.

### Templates from photos (optional)

As the admin, open **Admin** and choose **New from photos**. Pick the kind of building, add photos of a real one and anything you know about it (its length, which photo is the front). Claude reads the photos and suggests the settings, with notes on what it wasn't sure of. You then adjust the building in the editor with the photos above it, and **Publish template**: it shows up under **New** for everyone. Unpublish, rename or delete it on the Admin page; buildings made from it stay.

Claude can read the photos two ways, and the wizard offers both:

- **Ask Claude here:** the server sends the photos to the Claude API and fills in the answer. It needs an Anthropic API key in `.env` as `ANTHROPIC_API_KEY` (from the [Anthropic Console](https://console.anthropic.com/)); API use is paid per request, separately from a Claude subscription.
- **Use Claude in a chat:** copy the prompt the wizard gives you into a chat at [claude.ai](https://claude.ai), attach the same photos, and paste Claude's answer back. No key needed; it's part of your Claude plan.

Or skip Claude and start from one of the built-in designs.

## Run it on Kubernetes (Helm)

The chart is published as an OCI artifact on Docker Hub with every release, next to the images. You need Helm 3.8 or newer.

```sh
helm install house-to-i3d oci://registry-1.docker.io/rehn/house-to-i3d \
  --version 1.0.0 \
  --namespace house-to-i3d --create-namespace \
  --set adminEmail=you@example.se \
  --set ingress.enabled=true \
  --set ingress.host=hus.example.se \
  --set ingress.tls.enabled=true \
  --set ingress.tls.secretName=hus-tls
```

Use the release you want for `--version` (the chart version is the app version, without the `v`). To see every setting:

```sh
helm show values oci://registry-1.docker.io/rehn/house-to-i3d --version 1.0.0
```

Upgrade with the same values to a newer version:

```sh
helm upgrade house-to-i3d oci://registry-1.docker.io/rehn/house-to-i3d --version 1.1.0 --namespace house-to-i3d --reuse-values
```

Only the web app is exposed (through the ingress, or the `<release>-web` service if you bring your own proxy). `PUBLIC_URL` comes from the ingress host, or set `publicUrl` yourself. Without an ingress, try it with `kubectl port-forward svc/house-to-i3d-web 3000:3000` and `--set publicUrl=http://localhost:3000`.

### Where the data lives

Everything that is stored on disk is in a PersistentVolumeClaim. Pick the database with `database.type`:

| `database.type` | Data | API pods |
|---|---|---|
| `sqlite` (default) | One file in the PVC `<release>-data` (`database.sqlite.persistence`) | 1, updated with `Recreate` so two pods never open the file at once |
| `postgres`, `deploy: true` | A Postgres 17 StatefulSet in the release, data in the PVC `data-<release>-postgres-0` (`database.postgres.persistence`) | `api.replicas`, any number |
| `postgres`, `deploy: false` | Your own Postgres server (`database.postgres.url` or `existingSecret`) | `api.replicas`, any number |

Postgres in the release:

```sh
helm install house-to-i3d oci://registry-1.docker.io/rehn/house-to-i3d --version 1.0.0 \
  --set adminEmail=you@example.se --set publicUrl=https://hus.example.se \
  --set database.type=postgres
```

The password is generated on install and kept on upgrades, or set `database.postgres.password`.

Your own Postgres, with the URL in a Secret you manage:

```sh
kubectl create secret generic house-db --from-literal=DATABASE_URL='postgres://house:password@db.example.se:5432/house?sslmode=require'
helm install house-to-i3d oci://registry-1.docker.io/rehn/house-to-i3d --version 1.0.0 \
  --set adminEmail=you@example.se --set publicUrl=https://hus.example.se \
  --set database.type=postgres --set database.postgres.deploy=false \
  --set database.postgres.existingSecret=house-db
```

The API creates its tables on start. The volumes are kept when you `helm uninstall`: the SQLite PVC and the Postgres PVC with the Secret holding its password (`helm.sh/resource-policy: keep`). A reinstall with the same release name picks them up again. Delete them with `kubectl delete pvc ...` when you really want everything gone.

Google sign-in: `--set google.clientId=... --set google.clientSecret=...`, or `google.existingSecret` naming a Secret with `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

Templates from photos: `--set claude.apiKey=...`, or `claude.existingSecret` naming a Secret with `ANTHROPIC_API_KEY`.

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
bash charts/test.sh             # Helm chart: lint and render every setup (needs helm)
```

The store tests run on SQLite. To run them on Postgres too, point `TEST_DATABASE_URL` at a server (each test gets its own schema, dropped afterwards):

```sh
docker run -d --name hus-pg -e POSTGRES_PASSWORD=test -p 5432:5432 postgres:17-alpine
cd backend && TEST_DATABASE_URL='postgres://postgres:test@localhost:5432/postgres?sslmode=disable' go test ./internal/store/
```

No Go or Node on your machine? Run them in Docker:

```sh
docker run --rm -v "$PWD/backend:/src" -w /src golang:1.25-alpine sh -c "go mod tidy && go test ./..."
docker run --rm -v "$PWD/frontend:/app" -w /app node:22-alpine sh -c "npm install && npm test"
```

What the tests cover:

- **backend/internal/api**: signing up (admin without invite, everyone else with one), invites that only work once and only for their email, login and logout, rate limiting, Google sign-in against a fake Google, project create/read/update/delete, version conflicts between tabs, users not seeing each other's houses, and cross-site requests being refused.
- **backend/internal/store**: the database layer on SQLite and Postgres, including expiry of sessions and invites and two saves of the same version at once.
- **frontend/test**: settings validation, window generation, valid geometry for every roof type, closed collision for walls, roof, dormers, chimney and entrance, placement areas (leveling, clear, test, tip occlusion), i3d output, rooms and curtains behind the windows, the game mod files (checked against the game's own schemas when they were written), export file names and the API proxy.
- **charts/test.sh**: the Helm chart with SQLite, Postgres in the release, your own Postgres, ingress and Google sign-in, and the setups it must refuse.

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
| Pull request to `main` | Go tests (store on SQLite and Postgres), frontend tests, Next.js build, Helm chart tests | Images built, not pushed |
| Push to `main` | Same | `house-to-i3d-api:edge`, `house-to-i3d-web:edge` |
| Release `v1.2.3` published | Same | `1.2.3`, `1.2`, `1` and `latest` for both images, and the Helm chart `1.2.3` at `oci://registry-1.docker.io/rehn/house-to-i3d` |

Images are only built after all tests pass, for `linux/amd64` and `linux/arm64`. The chart is pushed after the images, so a published chart version always has its images.

One-time setup in the GitHub repo, under Settings → Secrets and variables → Actions:

- Variable `DOCKERHUB_USERNAME`: your Docker Hub username.
- Secret `DOCKERHUB_TOKEN`: a Docker Hub access token with Read & Write access (it pushes the images and the chart).

To release, publish a GitHub release with a tag like `v1.0.0`, for example with `gh release create v1.0.0 --generate-notes`.

## Configuration

| Variable | Service | Default | Meaning |
|---|---|---|---|
| `PUBLIC_URL` | api | required | The address people open, without a trailing slash |
| `ADMIN_EMAIL` | api | | Can sign up without an invite and becomes admin |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | api | | Turn on Sign in with Google |
| `ANTHROPIC_API_KEY` | api | | Lets the admin's template wizard ask Claude to read photos of a building |
| `DATABASE_PATH` | api | `/data/house-to-i3d.db` | SQLite file |
| `DATABASE_URL` | api | | `postgres://user:password@host:5432/db`: use Postgres instead of SQLite |
| `LISTEN_ADDR` | api | `:8080` | |
| `TRUST_PROXY` | api | `false` | Use `X-Forwarded-For` for rate limiting. Set `true` only when the API is reachable through the web app alone, as in docker-compose |
| `API_URL` | web | `http://api:8080` | Where the web app finds the API |

## Backups

With SQLite, everything is in one file in the `data` volume. To copy it out:

```sh
docker compose cp api:/data/house-to-i3d.db ./backup.db
```

Stop the stack first (`docker compose stop api`) for a copy that's guaranteed consistent.

On Kubernetes with SQLite, the API image has no shell or `tar`, so `kubectl cp` can't read from it. Stop the API, read the file with a short-lived pod that mounts the same PVC, then start the API again (release `house-to-i3d` here):

```sh
kubectl -n house-to-i3d scale deploy/house-to-i3d-api --replicas=0
kubectl -n house-to-i3d run backup --rm -i -q --restart=Never --image=alpine:3.22 --overrides='{
  "spec": {
    "volumes": [{"name": "data", "persistentVolumeClaim": {"claimName": "house-to-i3d-data"}}],
    "containers": [{"name": "backup", "image": "alpine:3.22", "stdin": true,
      "command": ["cat", "/data/house-to-i3d.db"],
      "volumeMounts": [{"name": "data", "mountPath": "/data", "readOnly": true}]}]
  }}' > backup.db
kubectl -n house-to-i3d scale deploy/house-to-i3d-api --replicas=1
```

With Postgres, use `pg_dump`, for example against the release's server:

```sh
kubectl -n house-to-i3d exec house-to-i3d-postgres-0 -- pg_dump -U house house > backup.sql
```
