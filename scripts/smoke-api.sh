#!/bin/sh
# smoke-api.sh — checks a deployment of the HTTP API, the realtime server and the game client
# (IMPL-0009). Writes nothing; only sends GET/POST requests and compares status codes and fields.
# Usage: scripts/smoke-api.sh [api_url] [server_url] [client_url]
#   defaults: production (https://api.… https://server.… https://play.…)
#   local:    scripts/smoke-api.sh http://localhost:8787 http://localhost:8788 http://localhost:8799
set -eu
API="${1:-https://api.vilanoeldobem.com.br}"
SERVER="${2:-https://server.vilanoeldobem.com.br}"
CLIENT="${3:-https://play.vilanoeldobem.com.br}"
fail=0
check() { # name, expected status, actual status
  if [ "$2" = "$3" ]; then echo "ok   $1 ($3)"; else echo "FAIL $1 (expected $2, got $3)"; fail=1; fi
}
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
# api
check "GET api /health" 200 "$(code "$API/health")"
curl -s "$API/health" | grep -q '"db":true' && echo "ok   D1 connected" || { echo "FAIL D1 not connected"; fail=1; }
check "GET api /indicators" 200 "$(code "$API/indicators")"
check "GET api /lots" 200 "$(code "$API/lots")"
curl -s "$API/lots" | grep -q '"id":"plaza-01"' && echo "ok   lots use English ids" || { echo "FAIL lots missing plaza-01"; fail=1; }
check "GET api /environment" 200 "$(code "$API/environment")"
curl -s "$API/environment" | grep -q '"timezone":"America/Sao_Paulo"' && echo "ok   environment uses São Paulo time" || { echo "FAIL environment timezone"; fail=1; }
check "POST api /lots" 405 "$(code -X POST "$API/lots")"
check "GET api /nope" 404 "$(code "$API/nope")"
# server
check "GET server /health" 200 "$(code "$SERVER/health")"
curl -s "$SERVER/health" | grep -q '"rooms":true' && echo "ok   rooms bound" || { echo "FAIL rooms binding missing"; fail=1; }
check "GET server /room without Origin" 403 "$(code --http1.1 -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' "$SERVER/room")"
# client
check "GET client / (SPA)" 200 "$(code "$CLIENT/")"
check "GET client /client/route (SPA fallback)" 200 "$(code "$CLIENT/client/route")"
exit $fail
