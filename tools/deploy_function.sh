#!/usr/bin/env bash
# Deploy the agent-api edge function and push its secrets from .env (git-ignored).
#   bash tools/deploy_function.sh
# .env holds DESK_AGENT_TOKEN (and later RESEND_API_KEY, NOTIFY_EMAIL).
set -euo pipefail
cd "$(dirname "$0")/.."
REF=lomsjeahhiyforjnwbtu
bash tools/sync-payload.sh
npx --yes supabase secrets set --project-ref "$REF" --env-file .env
# verify_jwt off: the function checks its own x-desk-token header instead.
npx --yes supabase functions deploy agent-api --project-ref "$REF" --no-verify-jwt --use-api
