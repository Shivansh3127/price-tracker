#!/usr/bin/env bash
# backend/build.sh
# Render build script — runs during the "Build Command" phase.
# Installs Node deps and then downloads Playwright's Chromium browser binary.
#
# On Render free tier, the filesystem is ephemeral, so Playwright's browser
# must be re-downloaded on every deploy. This script handles that.

set -e  # exit immediately on any error

echo "=== Installing Node.js dependencies ==="
npm install

echo "=== Installing Playwright Chromium browser ==="
# --with-deps installs system-level OS packages Chromium needs (fonts, libs)
npx playwright install chromium --with-deps

echo "=== Build complete ==="
