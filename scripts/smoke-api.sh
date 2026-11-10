#!/bin/sh
# smoke-api.sh — checks the public API routes of a deployment (local or production).
# Writes nothing; only sends GET/POST requests and compares status codes and expected fields.
# Usage: scripts/smoke-api.sh [base_url]   (default http://localhost:8787)
set -eu
BASE="${1:-http://localhost:8787}"
fail=0
check() { # name, expected status, actual status
  if [ "$2" = "$3" ]; then echo "ok   $1 ($3)"; else echo "FAIL $1 (expected $2, got $3)"; fail=1; fi
}
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
check "GET /api/health" 200 "$(code "$BASE/api/health")"
curl -s "$BASE/api/health" | grep -q '"db":true' && echo "ok   D1 connected" || { echo "FAIL D1 not connected"; fail=1; }
check "GET /api/indicators" 200 "$(code "$BASE/api/indicators")"
check "GET /api/lots" 200 "$(code "$BASE/api/lots")"
curl -s "$BASE/api/lots" | grep -q '"id":"plaza-01"' && echo "ok   lots use English ids" || { echo "FAIL lots missing plaza-01"; fail=1; }
check "GET /api/environment" 200 "$(code "$BASE/api/environment")"
curl -s "$BASE/api/environment" | grep -q '"timezone":"America/Sao_Paulo"' && echo "ok   environment uses São Paulo time" || { echo "FAIL environment timezone"; fail=1; }
check "POST /api/lots" 405 "$(code -X POST "$BASE/api/lots")"
check "GET /api/nope" 404 "$(code "$BASE/api/nope")"
check "GET / (SPA)" 200 "$(code "$BASE/")"
check "GET /client/route (SPA fallback)" 200 "$(code "$BASE/client/route")"
exit $fail
