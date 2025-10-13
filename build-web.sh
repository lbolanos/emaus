#!/bin/bash
set -e

echo "Installing pnpm..."
curl -fsSL https://get.pnpm.io/install.sh | sh -

echo "Adding pnpm to PATH..."
export PNPM_HOME="$HOME/.local/share/pnpm"
export PATH="$PNPM_HOME:$PATH"

echo "Installing dependencies..."
pnpm install --frozen-lockfile

echo "Building web frontend..."
pnpm --filter web build

echo "Web build completed successfully!"