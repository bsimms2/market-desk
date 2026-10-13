#!/usr/bin/env bash
# Build the web app and publish it to GitHub Pages (gh-pages branch).
#   bash tools/deploy_web.sh
# Live at https://bsimms2.github.io/market-desk/ about a minute after it finishes.
set -euo pipefail
cd "$(dirname "$0")/../apps/web"

rm -rf dist
CI=1 npx expo export --platform web

# GitHub Pages runs Jekyll by default, which drops folders starting with "_"
# (Expo puts the bundle in _expo/). .nojekyll turns that off.
touch dist/.nojekyll
# Any deep link refresh serves the app too.
cp dist/index.html dist/404.html

REMOTE="$(git -C ../.. remote get-url origin)"
cd dist
git init -q -b gh-pages
git add -A
git -c user.name="deploy" -c user.email="deploy@market-desk" commit -q -m "Deploy $(date -u +%Y-%m-%dT%H:%MZ)"
git push -f -q "$REMOTE" gh-pages:gh-pages
cd ..
rm -rf dist/.git
echo "Published. https://bsimms2.github.io/market-desk/"
