#!/usr/bin/env bash
# Starts the app locally for testing: Go API on :8080 (API_PORT in .env changes it) and Next.js dev server on :3000.
# Needs Go 1.25+ and Node 22+. Stop with Ctrl+C.
#
#   ./dev.sh          start (data is kept in .dev/ between runs)
#   ./dev.sh --reset  delete the local database first and start fresh
set -euo pipefail
cd "$(dirname "$0")"
root=$PWD

if [[ ${1:-} == --reset ]]; then
  rm -rf .dev
  echo "Local database deleted."
fi
mkdir -p .dev

# Settings: .env if it exists, otherwise create one with your git email as admin.
if [[ ! -f .env ]]; then
  cp .env.example .env
  email=$(git config user.email || true)
  if [[ -n $email ]]; then
    sed -i "s|^ADMIN_EMAIL=.*|ADMIN_EMAIL=$email|" .env
  fi
  echo "Created .env (ADMIN_EMAIL=${email:-not set}). Edit it to change settings."
fi
set -a; source .env; set +a

export PUBLIC_URL=http://localhost:3000
export DATABASE_PATH=$root/.dev/building-creator-fs25.db
API_PORT=${API_PORT:-8080}
export LISTEN_ADDR=127.0.0.1:$API_PORT
export API_URL=http://127.0.0.1:$API_PORT

for port in $API_PORT 3000; do
  if (exec 3<>/dev/tcp/127.0.0.1/$port) 2>/dev/null; then
    echo "Port $port is already in use. Stop whatever runs there (another ./dev.sh?) and try again." >&2
    exit 1
  fi
done

if [[ ! -d frontend/node_modules ]]; then
  echo "Installing frontend packages..."
  (cd frontend && npm install --no-audit --no-fund)
fi

echo "Building the API..."
(cd backend && go build -o "$root/.dev/server" ./cmd/server)

# Stop both servers when this script ends (Ctrl+C, error or one of them exiting).
trap 'trap - EXIT INT TERM; kill 0 2>/dev/null; wait 2>/dev/null' EXIT INT TERM

.dev/server 2>&1 | sed -u 's/^/[api] /' &
for _ in $(seq 50); do
  curl -fs "$API_URL/api/health" >/dev/null 2>&1 && break
  sleep 0.2
done
curl -fs "$API_URL/api/health" >/dev/null || { echo "The API didn't start, see [api] lines above." >&2; exit 1; }

(cd frontend && NEXT_TELEMETRY_DISABLED=1 npx next dev -p 3000 -H 127.0.0.1) 2>&1 | sed -u 's/^/[web] /' &

cat <<EOF

  House to i3d is starting at  http://localhost:3000
  First time: click "Create the admin account" and sign up as ${ADMIN_EMAIL:-<set ADMIN_EMAIL in .env>}
  Database: .dev/building-creator-fs25.db   (./dev.sh --reset to start over)
  Ctrl+C stops both servers.

EOF
wait -n
