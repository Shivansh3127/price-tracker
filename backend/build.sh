#!/usr/bin/env bash
# backend/build.sh — Render build script
# Installs Node deps then downloads the Playwright Chromium browser binary.
#
# PLAYWRIGHT_BROWSERS_PATH=0 stores the browser inside the project directory
# (node_modules/playwright-core/.local-browsers/) instead of ~/.cache/ms-playwright/
# This ensures the binary is available at runtime on Render's infrastructure.

set -e

echo "=== Installing Node.js dependencies ==="
npm install

echo "=== Installing Playwright Chromium browser ==="
# PLAYWRIGHT_BROWSERS_PATH=0 → stores browser in the package dir (persists on Render)
PLAYWRIGHT_BROWSERS_PATH=0 node_modules/.bin/playwright install chromium --with-deps 2>/dev/null \
  || PLAYWRIGHT_BROWSERS_PATH=0 node_modules/.bin/playwright install chromium

echo "=== Verifying Playwright ==="
PLAYWRIGHT_BROWSERS_PATH=0 node_modules/.bin/playwright --version

echo "=== Build complete ==="
