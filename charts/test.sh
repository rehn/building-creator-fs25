#!/usr/bin/env bash
# Tests for the Helm chart: renders it with helm template in each setup and checks the output.
# Usage: charts/test.sh   (needs helm 3.8+ on PATH)
set -uo pipefail
cd "$(dirname "$0")/house-to-i3d"

fails=0
render() { helm template hus . --namespace hus "$@" 2>&1; }
# doc KIND NAME: one rendered document (between --- separators) by kind and name
doc() { awk -v k="kind: $1" -v n="  name: $2" 'BEGIN{RS="\n---\n"} index($0, k"\n") && index($0, n"\n")' <<<"$out"; }
ok()  { printf '  ok   %s\n' "$1"; }
bad() { printf '  FAIL %s\n' "$1"; fails=$((fails + 1)); }
has()     { grep -qF -- "$2" <<<"$1" && ok "$3" || bad "$3 (missing: $2)"; }
hasnt()   { grep -qF -- "$2" <<<"$1" && bad "$3 (found: $2)" || ok "$3"; }
renders() { [ $? -eq 0 ] && ok "$1 renders" || { bad "$1 does not render"; echo "$out" | head -5; }; }
refuses() { local msg=$1; shift; out=$(render "$@"); if [ $? -ne 0 ] && grep -qF -- "$msg" <<<"$out"; then ok "refused: $msg"; else bad "not refused: $msg"; echo "$out" | head -3; fi; }

echo "lint"
helm lint . --set publicUrl=https://hus.example.se >/dev/null && ok "helm lint" || bad "helm lint"
for f in ci/*-values.yaml; do helm lint . -f "$f" >/dev/null && ok "helm lint $f" || bad "helm lint $f"; done

echo "SQLite (default): one API pod, database on a kept PVC"
out=$(render --set publicUrl=https://hus.example.se --set adminEmail=me@example.se); renders "default"
api=$(doc Deployment hus-house-to-i3d-api)
has "$api" "replicas: 1" "one API pod"
has "$api" "type: Recreate" "old pod stops before the new one opens the file"
has "$api" "mountPath: /data" "data volume mounted at /data"
has "$api" "claimName: hus-house-to-i3d-data" "data volume is the chart's PVC"
has "$api" 'value: "https://hus.example.se"' "PUBLIC_URL"
has "$api" 'value: "me@example.se"' "ADMIN_EMAIL"
has "$api" "fsGroup: 65532" "PVC writable by the nonroot user"
has "$api" "docker.io/rehn/house-to-i3d-api:$(awk '/^appVersion:/{gsub(/"/,"",$2); print $2}' Chart.yaml)" "API image tag defaults to appVersion"
hasnt "$api" "DATABASE_URL" "no DATABASE_URL"
pvc=$(doc PersistentVolumeClaim hus-house-to-i3d-data)
has "$pvc" "storage: 1Gi" "PVC size"
has "$pvc" 'helm.sh/resource-policy: keep' "PVC survives helm uninstall"
web=$(doc Deployment hus-house-to-i3d-web)
has "$web" 'value: "http://hus-house-to-i3d-api:8080"' "web finds the API service"
has "$web" 'name: MAX_PARTS' "web gets MAX_PARTS"
has "$web" 'value: "12"' "MAX_PARTS is 12 to start with"
keep=$out; out=$(render --set publicUrl=https://hus.example.se --set adminEmail=me@example.se --set web.maxParts=20)
has "$(doc Deployment hus-house-to-i3d-web)" 'value: "20"' "web.maxParts sets MAX_PARTS"
out=$keep
has "$(doc Service hus-house-to-i3d-api)" "port: 8080" "API service"
has "$(doc Service hus-house-to-i3d-web)" "port: 3000" "web service"
hasnt "$out" "kind: StatefulSet" "no Postgres"
hasnt "$out" "kind: Ingress" "no ingress unless asked"

out=$(render --set publicUrl=https://hus.example.se --set database.sqlite.persistence.existingClaim=my-claim); renders "existing claim"
has "$(doc Deployment hus-house-to-i3d-api)" "claimName: my-claim" "uses the existing claim"
hasnt "$out" "kind: PersistentVolumeClaim" "creates no PVC of its own"

echo "Ingress"
out=$(render --set ingress.enabled=true --set ingress.host=hus.example.se --set ingress.tls.enabled=true --set ingress.tls.secretName=hus-tls); renders "ingress"
has "$(doc Deployment hus-house-to-i3d-api)" 'value: "https://hus.example.se"' "PUBLIC_URL from the ingress host"
ing=$(doc Ingress hus-house-to-i3d)
has "$ing" 'host: "hus.example.se"' "ingress host"
has "$ing" "name: hus-house-to-i3d-web" "ingress points at the web service"
has "$ing" "secretName: hus-tls" "ingress TLS"
out=$(render --set ingress.enabled=true --set ingress.host=hus.example.se); renders "ingress without TLS"
has "$(doc Deployment hus-house-to-i3d-api)" 'value: "http://hus.example.se"' "http PUBLIC_URL without TLS"

echo "Google sign-in"
out=$(render --set publicUrl=https://hus.example.se --set google.clientId=cid --set google.clientSecret=csecret); renders "google"
has "$(doc Secret hus-house-to-i3d)" "GOOGLE_CLIENT_SECRET: $(printf csecret | base64)" "secret holds the client secret"
has "$(doc Deployment hus-house-to-i3d-api)" "key: GOOGLE_CLIENT_SECRET" "API reads it from the secret"
out=$(render --set publicUrl=https://hus.example.se --set google.existingSecret=gsec); renders "google existing secret"
has "$(doc Deployment hus-house-to-i3d-api)" "name: gsec" "API reads Google from the existing secret"

echo "Claude reads photos for the admin's templates"
out=$(render --set publicUrl=https://hus.example.se); hasnt "$out" "ANTHROPIC_API_KEY" "no key, no Claude"
out=$(render --set publicUrl=https://hus.example.se --set claude.apiKey=sk-test); renders "claude"
has "$(doc Secret hus-house-to-i3d)" "ANTHROPIC_API_KEY: $(printf sk-test | base64)" "secret holds the API key"
has "$(doc Deployment hus-house-to-i3d-api)" "key: ANTHROPIC_API_KEY" "API reads it from the secret"
out=$(render --set publicUrl=https://hus.example.se --set claude.existingSecret=csec); renders "claude existing secret"
has "$(doc Deployment hus-house-to-i3d-api)" "name: csec" "API reads the key from the existing secret"
hasnt "$(doc Secret hus-house-to-i3d)" "ANTHROPIC_API_KEY" "no key copied into the chart's secret"

echo "Postgres in the release"
out=$(render --set publicUrl=https://hus.example.se --set database.type=postgres --set api.replicas=2); renders "bundled postgres"
sts=$(doc StatefulSet hus-house-to-i3d-postgres)
has "$sts" "volumeClaimTemplates:" "Postgres data on a PVC"
has "$sts" "storage: 5Gi" "Postgres PVC size"
has "$sts" "image: docker.io/library/postgres:" "official Postgres image"
has "$sts" "key: POSTGRES_PASSWORD" "password from the secret"
has "$(doc Service hus-house-to-i3d-postgres)" "port: 5432" "Postgres service"
db=$(doc Secret hus-house-to-i3d-db)
has "$db" "DATABASE_URL:" "secret has the URL"
has "$db" 'helm.sh/resource-policy: keep' "password secret kept with the data"
url=$(awk '/DATABASE_URL:/{print $2}' <<<"$db" | base64 -d)
grep -qE '^postgres://house:[A-Za-z0-9]{32}@hus-house-to-i3d-postgres:5432/house\?sslmode=disable$' <<<"$url" && ok "URL points at the release's Postgres" || bad "URL: $url"
api=$(doc Deployment hus-house-to-i3d-api)
has "$api" "name: hus-house-to-i3d-db" "API reads DATABASE_URL from the secret"
has "$api" "replicas: 2" "more than one API pod is fine with Postgres"
hasnt "$api" "mountPath: /data" "no data volume on the API"
hasnt "$out" "name: hus-house-to-i3d-data" "no SQLite PVC"

out=$(render --set publicUrl=https://hus.example.se --set database.type=postgres --set database.postgres.password='p@ss/w:rd'); renders "postgres with a password"
url=$(awk '/DATABASE_URL:/{print $2}' <<<"$(doc Secret hus-house-to-i3d-db)" | base64 -d)
has "$url" "house:p%40ss%2Fw%3Ard@" "password is escaped in the URL"

echo "Postgres elsewhere"
out=$(render --set publicUrl=https://hus.example.se --set database.type=postgres --set database.postgres.deploy=false --set database.postgres.url='postgres://u:p@db.example.se/hus'); renders "external url"
hasnt "$out" "kind: StatefulSet" "no Postgres in the release"
has "$(doc Secret hus-house-to-i3d)" "DATABASE_URL: $(printf 'postgres://u:p@db.example.se/hus' | base64 -w0)" "URL in the app secret"
has "$(doc Deployment hus-house-to-i3d-api)" "key: DATABASE_URL" "API reads DATABASE_URL"
out=$(render --set publicUrl=https://hus.example.se --set database.type=postgres --set database.postgres.deploy=false --set database.postgres.existingSecret=pgsec --set database.postgres.existingSecretKey=url); renders "external secret"
api=$(doc Deployment hus-house-to-i3d-api)
has "$api" "name: pgsec" "secret name"
has "$api" "key: url" "secret key"

echo "Refused setups"
refuses "publicUrl" --set adminEmail=me@example.se
refuses "SQLite allows one API pod" --set publicUrl=https://hus.example.se --set api.replicas=2
refuses "database.postgres.url or database.postgres.existingSecret" --set publicUrl=https://hus.example.se --set database.type=postgres --set database.postgres.deploy=false
refuses "database.type" --set publicUrl=https://hus.example.se --set database.type=mysql

echo
[ $fails -eq 0 ] && echo "all chart tests passed" || { echo "$fails chart test(s) failed"; exit 1; }
