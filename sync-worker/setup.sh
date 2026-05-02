#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# --- KV namespace: create + paste id into wrangler.toml ---
if grep -q "PASTE_KV_ID_HERE" wrangler.toml; then
  echo "==> Creating KV namespace 'vibe_state'..."
  out=$(wrangler kv namespace create vibe_state 2>&1)
  echo "$out"
  id=$(echo "$out" | grep -oE '"[a-f0-9]{32}"' | head -1 | tr -d '"')
  if [ -z "$id" ]; then
    echo "ERROR: Could not parse KV namespace ID. Edit wrangler.toml manually." >&2
    exit 1
  fi
  sed -i.bak "s/PASTE_KV_ID_HERE/$id/" wrangler.toml && rm wrangler.toml.bak
  echo "==> Pasted KV id: $id"
else
  echo "==> KV namespace already configured (skipping)."
fi

# --- Initial deploy creates the Worker ---
echo "==> Deploying Worker..."
wrangler deploy

# --- Secret: generate + attach + cache locally for `wrangler dev` ---
if [ ! -f .dev.vars ]; then
  secret=$(openssl rand -hex 32)
  echo "SYNC_SECRET=$secret" > .dev.vars
  echo "==> Generated secret; attaching to Worker..."
  echo "$secret" | wrangler secret put SYNC_SECRET
  echo ""
  echo "===================================================="
  echo "  SECRET (save — paste into client settings panel):"
  echo "  $secret"
  echo "===================================================="
else
  echo "==> Secret already in .dev.vars (skipping)."
fi
