#!/usr/bin/env bash
# Copy the shared payload validator into the edge function folder (Deno can't import the workspace package).
set -euo pipefail
cd "$(dirname "$0")/.."
cp packages/desk/src/payload.ts supabase/functions/agent-api/payload.ts
echo "synced payload.ts"
