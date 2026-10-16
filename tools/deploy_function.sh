#!/usr/bin/env bash
# Deploy the agent-api and quote edge functions and push secrets from .env (git-ignored).
#   bash tools/deploy_function.sh
# .env holds DESK_AGENT_TOKEN (and later RESEND_API_KEY, NOTIFY_EMAIL).
set -euo pipefail
cd "$(dirname "$0")/.."
REF=lomsjeahhiyforjnwbtu
bash tools/sync-payload.sh
npx --yes supabase secrets set --project-ref "$REF" --env-file .env
# verify_jwt off: the function checks its own x-desk-token header instead.
npx --yes supabase functions deploy agent-api --project-ref "$REF" --no-verify-jwt --use-api
# quote keeps verify_jwt on: only signed-in app users (and the agent token) may call it.
npx --yes supabase functions deploy quote --project-ref "$REF" --use-api
