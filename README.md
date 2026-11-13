# House to i3d

Build buildings for Farming Simulator 25 in the browser: farmhouses, hen houses, cow and sheep barns, garages, machine halls, carports and sheds. Export them as `.i3d` (zipped with textures) to finish in Giants Editor, or as a ready-made game mod. Each building is saved to your account, so you can come back and change it later. Accounts are invite only.

```
backend/    Go API: accounts, invites, projects, templates, your items and extensions (SQLite or Postgres)
frontend/   Next.js app: login, "My buildings", "My items", the 3D editor, the admin pages
charts/     Helm chart for Kubernetes, and its tests
docs/       Plans (in Swedish): PLAN.md, PLAN_PARTS.md
docker-compose.yml
.github/workflows/ci.yml
```

## What you can build

Choose a starting point under **New** (the admin can add more from photos, see below) and change everything in the editor:

| Kind | Starting points | Notes |
|---|---|---|
| Farmhouse | Farmhouse | Rooms behind the windows; a sleep point makes it a farmhouse in the game |
| Hen houses | Garden coop, long hen house, poultry barn | A pasture with a fence, feed pad, egg pallets |
| Cow barns | Red barn, cowshed, loose-housing barn | Pasture, troughs, feed and animal trailer places, a walking area for the animals |
| Sheep barns | Fårhus, fårstall, stor fårstall | As the cow barn, with wool pallets |
| Sheds | Garage, machine hall, woodshed, carport, lean-to (lider) | Open sides, sliding sheet-metal doors, an optional vehicle workshop |

In the editor you can:

- Set the size, floors (with their own heights, and an attic), roof (gable, hip, flat or leaning), foundation, wall cladding (boards, plaster, corrugated sheet metal) with a split between two materials, and the roof covering (tiles, standing seam, falsad plåt, corrugated sheet metal).
- Add **extensions** (L, T and U shapes, annexes; an extension can carry others) and divide a building into **sections** with their own floors and heights.
- Put windows and doors on any wall (many styles; doors up to 20 × 12 m, sliding doors, doors that open in the game) and let the editor spread them out for you.
- Walk into the ground floor, arrange the inside from a catalogue of pieces (or fill it automatically), place the game objects the game needs (feed pad, bale drop, trailer spot, pallets, troughs, a fence you can draw, a vehicle workshop) and look around in first person.
- Bring your own props from Giants Editor under **My items**, and save extensions you want to reuse.
- Pick the language (English or Swedish) in the top bar.

Export one building as `.i3d` with its textures, or as a game mod (the placeable XML, i3d, textures and shop picture). On the start page you can tick several buildings and pack them into one mod.

What has been confirmed in FS25 and what has not is noted in [CLAUDE.md](CLAUDE.md).

## How it fits together

The browser only talks to the Next.js app. Everything under `/api/` is forwarded to the Go API, which isn't exposed to the internet. That keeps the session cookie same-origin and simple.

```
browser ──► web (Next.js, port 3000) ──/api/*──► api (Go, port 8080) ──► SQLite in the "data" volume, or Postgres
```

Each building is one row in the database: its name, a thumbnail, and every setting from the editor as one JSON document (extensions, sections, windows and doors, the inside, game objects and the game mod details included). Old saves are migrated when they are opened; nothing in the database changes. The editor saves about a second after each change.

The editor itself runs in the browser (three.js for the preview). `frontend/src/editor/model.mjs` holds the logic every building shares (settings, geometry, i3d export, the game mod files) with no DOM, so it can be tested in Node. Each kind of building is a small module in `frontend/src/editor/kinds/`; `layout.mjs` has the walls, extensions, sections and the inside, `openings.mjs` the windows and doors, `editor.mjs` the controls and the preview. Texts are in `frontend/src/i18n/locales/` (English is the key, Swedish is `sv.json`).

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

Claude can read the photos two ways, and the wizard offers both (the guide it follows is in `frontend/src/editor/fromPhotos.mjs`):

- **Ask Claude here:** the server sends the photos to the Claude API and fills in the answer. It needs an Anthropic API key in `.env` as `ANTHROPIC_API_KEY` (from the [Anthropic Console](https://console.anthropic.com/)); API use is paid per request, separately from a Claude subscription.
- **Use Claude in a chat:** copy the prompt the wizard gives you into a chat at [claude.ai](https://claude.ai), attach the same photos, and paste Claude's answer back. No key needed; it's part of your Claude plan.

Or skip Claude and start from one of the built-in designs.

## Run it on Kubernetes (Helm)

The chart is published as an OCI artifact on Docker Hub with every release, next to the images. You need Helm 3.8 or newer.

Put your settings in a values file, `values.yaml`, and install with it. This one exposes the web app through a Gateway API `HTTPRoute` attached to a Gateway you already have:

```yaml
# values.yaml
adminEmail: you@example.se        # can sign up without an invite and becomes the admin

httpRoute:
  enabled: true
  hostnames:
    - hus.example.se
  parentRefs:                     # the Gateway to attach to
    - name: gateway
      namespace: gateway-system
      sectionName: https
  tls: true                       # the Gateway serves the host over https (sets the default publicUrl)

# Optional (see the sections below):
# claude:
#   existingSecret: house-claude  # a Secret with ANTHROPIC_API_KEY
# google:
#   existingSecret: house-google  # a Secret with GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
# database:
#   type: postgres
```

```sh
helm install building-creator-fs25 oci://registry-1.docker.io/rehn/building-creator-fs25 \
  --version 1.0.0 \
  --namespace building-creator-fs25 --create-namespace \
  -f values.yaml
```

`-f` and `--set` combine (`--set` wins), so you can still change a single setting on the command line, like `--set adminEmail=you@example.se`.

Use the release you want for `--version` (the chart version is the app version, without the `v`). To see every setting:

```sh
helm show values oci://registry-1.docker.io/rehn/building-creator-fs25 --version 1.0.0
```

Upgrade to a newer version with the same values file:

```sh
helm upgrade building-creator-fs25 oci://registry-1.docker.io/rehn/building-creator-fs25 --version 1.1.0 --namespace building-creator-fs25 -f values.yaml
```

Only the web app is exposed (through the `HTTPRoute`, or the `<release>-web` service if you bring your own proxy). `PUBLIC_URL` comes from the route's first hostname, or set `publicUrl` yourself. Without a route, try it with `kubectl port-forward svc/building-creator-fs25-web 3000:3000` and `--set publicUrl=http://localhost:3000`.

### Where the data lives

Everything that is stored on disk is in a PersistentVolumeClaim. Pick the database with `database.type`:

| `database.type` | Data | API pods |
|---|---|---|
| `sqlite` (default) | One file in the PVC `<release>-data` (`database.sqlite.persistence`) | 1, updated with `Recreate` so two pods never open the file at once |
| `postgres`, `deploy: true` | A Postgres 17 StatefulSet in the release, data in the PVC `data-<release>-postgres-0` (`database.postgres.persistence`) | `api.replicas`, any number |
| `postgres`, `deploy: false` | Your own Postgres server (`database.postgres.url` or `existingSecret`) | `api.replicas`, any number |

Postgres in the release:

```sh
helm install building-creator-fs25 oci://registry-1.docker.io/rehn/building-creator-fs25 --version 1.0.0 \
  --set adminEmail=you@example.se --set publicUrl=https://hus.example.se \
  --set database.type=postgres
```

The password is generated on install and kept on upgrades, or set `database.postgres.password`.

Your own Postgres, with the URL in a Secret you manage:

```sh
kubectl create secret generic house-db --from-literal=DATABASE_URL='postgres://house:password@db.example.se:5432/house?sslmode=require'
helm install building-creator-fs25 oci://registry-1.docker.io/rehn/building-creator-fs25 --version 1.0.0 \
  --set adminEmail=you@example.se --set publicUrl=https://hus.example.se \
  --set database.type=postgres --set database.postgres.deploy=false \
  --set database.postgres.existingSecret=house-db
```

The API creates its tables on start. The volumes are kept when you `helm uninstall`: the SQLite PVC and the Postgres PVC with the Secret holding its password (`helm.sh/resource-policy: keep`). A reinstall with the same release name picks them up again. Delete them with `kubectl delete pvc ...` when you really want everything gone.

Google sign-in: `--set google.clientId=... --set google.clientSecret=...`, or `google.existingSecret` naming a Secret with `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

Templates from photos: `--set claude.apiKey=...`, or `claude.existingSecret` naming a Secret with `ANTHROPIC_API_KEY`.

### Going online

Put the `web` service behind a reverse proxy with HTTPS (Caddy, Traefik, nginx) and set `PUBLIC_URL` to the https address. Cookies are then marked Secure automatically. Open the app at exactly `PUBLIC_URL`: requests from any other origin are rejected as a CSRF protection.

## Notes for working on it

[CLAUDE.md](CLAUDE.md) describes the code in detail (how each part works, what has been confirmed in the game) and [docs/PLAN.md](docs/PLAN.md) is the plan, in Swedish. The way of working is test first: write the failing test, then the code.

## Develop

With Go 1.25+ and Node 22+ installed, start everything with one command:

```sh
./dev.sh            # API on :8080 (API_PORT in .env changes it), app on http://localhost:3000, Ctrl+C stops both
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
cd frontend && npm test         # building model, kinds, export, translations, API proxy (node --test, no browser needed)
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

- **backend/internal/api**: signing up (admin without invite, everyone else with one), invites that only work once and only for their email, login and logout, rate limiting, Google sign-in against a fake Google, project create/read/update/delete, version conflicts between tabs, users not seeing each other's buildings, templates, your items and extensions, and cross-site requests being refused. **backend/internal/vision** reads photos against a fake Claude API.
- **backend/internal/store**: the database layer on SQLite and Postgres, including expiry of sessions and invites and two saves of the same version at once.
- **frontend/test**: settings validation and old saves (a set of "golden saves" that must keep building the same), window generation, valid geometry for every roof type and kind, extensions and sections, closed collision, faces that would flicker, the inside and its pieces, the animals' walking area, game objects and the vehicle workshop, i3d output, the game mod files (checked against the game's own schemas when they were written), the photo guide, translations, export file names and the API proxy.
- **charts/test.sh**: the Helm chart with SQLite, Postgres in the release, your own Postgres, HTTPRoute (and the older ingress) and Google sign-in, and the setups it must refuse.

## Lock files

`backend/go.sum` and `frontend/package-lock.json` are committed, so builds are repeatable. After changing a dependency, update them (`go mod tidy` in `backend/`, `npm install` in `frontend/`) and commit the result.

## CI/CD and releases

`.github/workflows/ci.yml` runs on every pull request and push:

| Event | Tests | Docker Hub |
|---|---|---|
| Pull request to `main` | Go tests (store on SQLite and Postgres), frontend tests, Next.js build, Helm chart tests | Images built, not pushed |
| Push to `main` | Same | `building-creator-fs25-api:edge`, `building-creator-fs25-web:edge` |
| Release `v1.2.3` published | Same | `1.2.3`, `1.2`, `1` and `latest` for both images, and the Helm chart `1.2.3` at `oci://registry-1.docker.io/rehn/building-creator-fs25` |

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
| `DATABASE_PATH` | api | `/data/building-creator-fs25.db` | SQLite file |
| `DATABASE_URL` | api | | `postgres://user:password@host:5432/db`: use Postgres instead of SQLite |
| `LISTEN_ADDR` | api | `:8080` | |
| `TRUST_PROXY` | api | `false` | Use `X-Forwarded-For` for rate limiting. Set `true` only when the API is reachable through the web app alone, as in docker-compose |
| `API_URL` | web | `http://api:8080` | Where the web app finds the API |
| `MAX_PARTS` | web | `12` | The most extensions a building can have besides its main part, at any depth (at most 40). Helm: `web.maxParts` |

## Backups

With SQLite, everything is in one file in the `data` volume. To copy it out:

```sh
docker compose cp api:/data/building-creator-fs25.db ./backup.db
```

Stop the stack first (`docker compose stop api`) for a copy that's guaranteed consistent.

On Kubernetes with SQLite, the API image has no shell or `tar`, so `kubectl cp` can't read from it. Stop the API, read the file with a short-lived pod that mounts the same PVC, then start the API again (release `building-creator-fs25` here):

```sh
kubectl -n building-creator-fs25 scale deploy/building-creator-fs25-api --replicas=0
kubectl -n building-creator-fs25 run backup --rm -i -q --restart=Never --image=alpine:3.22 --overrides='{
  "spec": {
    "volumes": [{"name": "data", "persistentVolumeClaim": {"claimName": "building-creator-fs25-data"}}],
    "containers": [{"name": "backup", "image": "alpine:3.22", "stdin": true,
      "command": ["cat", "/data/building-creator-fs25.db"],
      "volumeMounts": [{"name": "data", "mountPath": "/data", "readOnly": true}]}]
  }}' > backup.db
kubectl -n building-creator-fs25 scale deploy/building-creator-fs25-api --replicas=1
```

With Postgres, use `pg_dump`, for example against the release's server:

```sh
kubectl -n building-creator-fs25 exec building-creator-fs25-postgres-0 -- pg_dump -U house house > backup.sql
```
