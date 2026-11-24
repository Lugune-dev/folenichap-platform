#!/usr/bin/env bash
# Runs FoleniChap on your laptop against the ONLINE (Neon) database.
#   backend  -> http://localhost:8080  (Swagger: /swagger-ui.html)
#   frontend -> http://localhost:4200
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1  -> $2"; exit 1; }; }
need java  "sudo apt install -y openjdk-21-jdk"
need mvn   "sudo apt install -y maven"
need node  "curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs"
java -version 2>&1 | grep -qE 'version "(2[1-9]|[3-9][0-9])' || { echo "Java 21+ required (sudo apt install openjdk-21-jdk)"; exit 1; }

[ -f .env ] || { echo "Create .env first: cp .env.example .env  (then fill DB_* and JWT_SECRET)"; exit 1; }
set -a; source .env; set +a
[ -n "${JWT_SECRET:-}" ] || { echo "JWT_SECRET is empty. Run: openssl rand -base64 48  and paste it into .env"; exit 1; }
# local defaults
export PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-http://localhost:4200}"
export CORS_ALLOWED_ORIGINS="http://localhost:4200"
export REDIS_URL="${REDIS_URL/redis:\/\/redis:/redis://localhost:}"

echo "==> Building backend (first time downloads dependencies, a few minutes)"
(cd backend-spring && mvn -q -B -DskipTests package)

echo "==> Starting backend on :8080 (log: backend.log)"
java -jar backend-spring/target/folenichap.jar > backend.log 2>&1 &
BACK=$!
trap 'echo; echo "Stopping..."; kill $BACK 2>/dev/null || true' EXIT

for i in $(seq 1 90); do
  if curl -sf http://localhost:8080/actuator/health >/dev/null; then echo "    backend is UP"; break; fi
  if ! kill -0 $BACK 2>/dev/null; then echo "Backend failed to start. Last lines of backend.log:"; tail -40 backend.log; exit 1; fi
  sleep 2
done

echo "==> Installing frontend packages"
(cd frontend-angular && [ -d node_modules ] || npm install)

echo "==> Frontend on http://localhost:4200  (Ctrl+C stops everything)"
cd frontend-angular && npx ng serve --proxy-config proxy.conf.json --open
