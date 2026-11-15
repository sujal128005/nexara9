#!/usr/bin/env bash
# Deploys ai-worker/worker.js to Cloudflare as "nexara9-ai" (https://nexara9-ai.nexara9.workers.dev).
# Needs a Cloudflare API token with the "Edit Cloudflare Workers" permissions in CLOUDFLARE_API_TOKEN
# and the account id in CLOUDFLARE_ACCOUNT_ID. The AI keys are Cloudflare secrets (GROQ_API_KEY,
# GEMINI_API_KEY) set in the dashboard; "keep_bindings" keeps them on every deploy.
set -euo pipefail
cd "$(dirname "$0")"
META='{"main_module":"worker.js","compatibility_date":"2026-10-01","bindings":[{"type":"ai","name":"AI"}],"keep_bindings":["secret_text"]}'
curl -sS -X PUT "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/nexara9-ai" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -F "metadata=${META};type=application/json" \
  -F "worker.js=@worker.js;type=application/javascript+module"
echo
