#!/bin/bash
# Symlink Puppeteer Chrome to where Playwright expects it
mkdir -p /opt/google
ln -sfn /home/lbolanos/.cache/puppeteer/chrome/linux-147.0.7727.56/chrome-linux64 /opt/google/chrome
echo "Done. Linked at: $(ls -la /opt/google/chrome)"
ls /opt/google/chrome/chrome
