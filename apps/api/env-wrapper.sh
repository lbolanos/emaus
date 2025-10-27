#!/bin/bash

# Get the script directory and cd there
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
cd "$DIR"

echo "PWD: $PWD" >&2
echo "DIR: $DIR" >&2

# Load environment variables from .env.production
if [ -f .env.production ]; then
  echo "Found .env.production" >&2
  #echo "Contents:" >&2
  #cat .env.production >&2
  #echo "End contents" >&2
  while read -r line || [[ -n "$line" ]]; do
    #echo "Reading line: '$line'" >&2
    if [[ ! "$line" =~ ^# ]] && [[ -n "$line" ]]; then
      #echo "Exporting: $line" >&2
      export "$line"
      #echo "Exported $line" >&2
    #else
      #echo "Skipping line: '$line'" >&2
    fi
  done < .env.production
else
  echo ".env.production not found" >&2
  ls -la >&2
fi

# Set NODE_ENV if not set
export NODE_ENV=production

# Debug: print the GOOGLE_CLIENT_ID
#echo "Final GOOGLE_CLIENT_ID: $GOOGLE_CLIENT_ID" >&2

# Run the command passed as arguments
exec "$@"
