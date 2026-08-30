#!/usr/bin/env python3
"""Deploy admin directory to Cloudflare Pages via Direct Upload API."""
import json, os, hashlib, base64, mimetypes
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

CF_EMAIL = os.environ.get("CF_EMAIL")
CF_KEY = os.environ.get("CF_KEY")
CF_ACC = os.environ.get("CF_ACC")
ADMIN_DIR = Path("admin")

headers = {"X-Auth-Email": CF_EMAIL, "X-Auth-Key": CF_KEY}
base = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACC}/pages/projects/blog-admin"

# Collect files
manifest = {}
file_data = {}
for f in sorted(ADMIN_DIR.rglob("*")):
    if f.is_file() and ".git" not in str(f):
        rel = str(f.relative_to(ADMIN_DIR)).replace("\\", "/")
        content = f.read_bytes()
        h = hashlib.sha256(content).hexdigest()
        manifest[rel] = h
        file_data[rel] = content
        print(f"  {rel} ({len(content)} bytes)")

# Create deployment
body = json.dumps({
    "manifest": manifest,
    "branch": "main",
}).encode()

req = Request(
    f"{base}/deployments",
    data=body,
    headers={**headers, "Content-Type": "application/json"},
    method="POST",
)
try:
    resp = json.loads(urlopen(req).read())
    print(f"\nDeploy created: {resp.get('success')}")
    if resp.get("result"):
        deploy_id = resp["result"]["id"]
        print(f"Deploy ID: {deploy_id}")
        print(f"URL: {resp['result'].get('url', '')}")
except HTTPError as e:
    err = e.read().decode()
    print(f"Error: {err}")
