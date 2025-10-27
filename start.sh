#!/bin/bash
set -e

# Add pnpm to PATH...
export PNPM_HOME="$HOME/.local/share/pnpm"
export PATH="$PNPM_HOME:$PATH"

echo "Starting API service..."
cd apps/api
pnpm start
