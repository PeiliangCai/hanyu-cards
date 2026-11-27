"""Production HTTP checks; run after `docker compose up --build -d --wait`."""

import json
import os
import re
import urllib.error
import urllib.request


BASE_URL = os.environ.get("SMOKE_BASE_URL", "http://127.0.0.1:8080").rstrip("/")
HTTP = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def request(path, body=None, expected_status=200):
    headers = {"Origin": BASE_URL}
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE_URL + path, data=body, headers=headers)
    try:
        response = HTTP.open(req, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        content = response.read().decode("utf-8")
        assert response.status == expected_status, (path, response.status, content)
        assert response.headers["X-Content-Type-Options"] == "nosniff", path
        assert "frame-ancestors 'none'" in response.headers["Content-Security-Policy"], path
        return content, response.headers


health, _ = request("/healthz")
assert json.loads(health)["ok"] is True
index, headers = request("/")
assert '<div id="app"' in index
assert headers["Cache-Control"] == "no-cache"
route, _ = request("/learn/deep-link")
assert route == index, "SPA deep links should return the entry point"
assets = re.findall(r'(?:src|href)="(/assets/[^\"]+)"', index)
assert assets, "No compiled assets found"
for asset in assets:
    _, headers = request(asset)
    assert "immutable" in headers["Cache-Control"], asset
_, headers = request("/sw.js")
assert headers["Cache-Control"] == "no-cache"
manifest, headers = request("/manifest.webmanifest")
assert json.loads(manifest)["name"] == "HanYu Cards"
assert headers["Cache-Control"] == "no-cache"
_, headers = request("/assets/missing.js", expected_status=404)
assert headers["Cache-Control"] == "no-cache", "Missing assets must not be cached permanently"
missing, headers = request("/api/missing.js", expected_status=404)
assert "application/json" in headers["Content-Type"], "API routes must not enter static or SPA handling"
assert isinstance(json.loads(missing), dict)
request("/.env", expected_status=403)
request("/api/assistant/chat", body=b'{"message":""}', expected_status=400)
reply, headers = request("/api/assistant/chat", body=b'{"message":"Help me study Chinese"}')
assert isinstance(json.loads(reply)["reply"], str) and json.loads(reply)["reply"]
assert headers["Cache-Control"] == "no-store"
print("Production HTTP smoke checks passed.")
