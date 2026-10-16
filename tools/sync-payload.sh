#!/usr/bin/env bash
# Copy the shared validators into the edge function folder (Deno can't import the workspace package).
set -euo pipefail
cd "$(dirname "$0")/.."
cp packages/desk/src/payload.ts supabase/functions/agent-api/payload.ts
cp packages/desk/src/bot.ts supabase/functions/agent-api/bot-rules.ts
echo "synced payload.ts and bot-rules.ts"
