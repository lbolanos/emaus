#!/bin/bash
set -e

echo "Adding pnpm to PATH..."
export PNPM_HOME="$HOME/.local/share/pnpm"
export PATH="$PNPM_HOME:$PATH"

echo "Starting API service..."
cd apps/api
pnpm start