#!/usr/bin/env bash
#
# Smoke test for the curl friendly API (API tokens, uploads, direct URLs).
# Needs a running instance and an API token with the upload, read and manage
# scopes (Account -> API tokens). Only requires bash and curl.
#
#   BASE_URL=http://localhost:3000 TOKEN=pvx_... ./curl-smoke-test.sh
#
set -u

BASE_URL="${BASE_URL:-http://localhost:3000}"
TOKEN="${TOKEN:?Set TOKEN to an API token}"
AUTH=(-H "Authorization: Bearer ${TOKEN}")

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
passed=0
failed=0

check() { # check <description> <command...>
  local description="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "PASS  ${description}"
    passed=$((passed + 1))
  else
    echo "FAIL  ${description}"
    failed=$((failed + 1))
  fi
}

# status <expected> <curl args...>: succeeds if the HTTP status matches
status() {
  local expected="$1"
  shift
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$@")" = "$expected" ]
}

# The API answers with the public URL configured on the server. Rebuild direct
# links from BASE_URL so this also works when testing through localhost.
local_direct_url() {
  printf '%s/api/d/%s' "${BASE_URL}" "${1#*/api/d/}"
}

head -c 300000 /dev/urandom >"$workdir/report.bin"
echo "hello" >"$workdir/notes.txt"

# --- multipart upload -> share link
url="$(curl -sf "${AUTH[@]}" -F "file=@$workdir/report.bin" -F "expires=1d" \
  "${BASE_URL}/api/upload?format=text" | tr -d '\r\n')"
check "multipart upload returns a share link" test -n "$url"
share_id="${url##*/}"

# --- direct download is byte-identical
curl -sf "${BASE_URL}/api/d/${share_id}/report.bin" -o "$workdir/downloaded.bin"
check "direct download is identical" cmp -s "$workdir/report.bin" "$workdir/downloaded.bin"

# --- curl -OJ names the file like the upload
(cd "$workdir" && mkdir saved && cd saved && curl -sfOJ "${BASE_URL}/api/d/${share_id}/report.bin")
check "curl -OJ keeps the file name" cmp -s "$workdir/report.bin" "$workdir/saved/report.bin"

# --- Range requests
check "range request returns 206" status 206 -H "Range: bytes=0-99" \
  "${BASE_URL}/api/d/${share_id}/report.bin"

# --- PUT upload
url="$(curl -sf "${AUTH[@]}" -T "$workdir/notes.txt" \
  "${BASE_URL}/api/upload/notes.txt?expires=1d&format=direct" | tr -d '\r\n')"
url="$(local_direct_url "$url")"
check "PUT upload returns a direct link" test -n "$url"
check "PUT upload content is intact" test "$(curl -sf "$url")" = "hello"

# --- password protected share
url="$(curl -sf "${AUTH[@]}" -F "file=@$workdir/notes.txt" -F "password=hunter22" \
  "${BASE_URL}/api/upload?format=text" | tr -d '\r\n')"
protected_id="${url##*/}"
check "protected share refuses anonymous download" status 403 \
  "${BASE_URL}/api/d/${protected_id}/notes.txt"
share_token="$(curl -sf -X POST -H 'Content-Type: application/json' \
  -d '{"password":"hunter22"}' "${BASE_URL}/api/shares/${protected_id}/token" |
  sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"
check "X-Share-Token unlocks the protected share" test "$(curl -sf \
  -H "X-Share-Token: ${share_token}" "${BASE_URL}/api/d/${protected_id}/notes.txt")" = "hello"

# --- one-time download
url="$(curl -sf "${AUTH[@]}" -F "file=@$workdir/notes.txt" -F "oneTime=true" \
  "${BASE_URL}/api/upload?format=direct" | tr -d '\r\n')"
url="$(local_direct_url "$url")"
check "HEAD does not use up a one-time link" status 200 -I "$url"
check "first download of a one-time link works" test "$(curl -sf "$url")" = "hello"
check "second download of a one-time link is gone" status 404 "$url"

# --- bad tokens are rejected instead of silently uploading anonymously
check "invalid token is rejected" status 401 -H "Authorization: Bearer pvx_invalid" \
  -F "file=@$workdir/notes.txt" "${BASE_URL}/api/upload"

# --- cleanup: delete the first share with the token (needs the manage scope)
check "share can be deleted with the token" status 200 -X DELETE "${AUTH[@]}" \
  "${BASE_URL}/api/shares/${share_id}"
check "deleted share is gone" status 404 "${BASE_URL}/api/d/${share_id}/report.bin"

echo
echo "${passed} passed, ${failed} failed"
[ "$failed" -eq 0 ]
