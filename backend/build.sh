#!/usr/bin/env bash
# backend/build.sh — Render build script
# Installs Node deps then downloads the Playwright Chromium browser binary.
# NOTE: --with-deps is intentionally OMITTED — Render's build environment
# does not allow sudo/root, and the required system libs are pre-installed
# on Render's Ubuntu image.

set -e

echo "=== Installing Node.js dependencies ==="
npm install

echo "=== Installing Playwright Chromium browser ==="
node_modules/.bin/playwright install chromium

echo "=== Build complete ==="
