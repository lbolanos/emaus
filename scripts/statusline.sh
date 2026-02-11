#!/usr/bin/env bash

# Claude Code Status Line Script (WSL-compatible)
# Reads JSON from stdin and outputs formatted status

# Check for required dependencies
if ! command -v jq &> /dev/null; then
  echo "Error: jq is required but not installed"
  exit 1
fi

if ! command -v bc &> /dev/null; then
  echo "Error: bc is required but not installed"
  exit 1
fi

# Read JSON input from stdin
input=$(cat)

# Extract model information
model=$(echo "$input" | jq -r '.model.display_name')

# Extract context window information
window=$(echo "$input" | jq -r '.context_window.context_window_size')
window_k=$((window / 1000))

# Get the actual used_percentage from Claude (accurate context usage)
used_pct_raw=$(echo "$input" | jq -r '.context_window.used_percentage // empty')
if [ -z "$used_pct_raw" ] || [ "$used_pct_raw" = "null" ]; then
  used_pct_raw="0"
fi
# Convert to integer for comparisons
used_pct=$(printf "%.0f" "$used_pct_raw" 2>/dev/null || echo "0")

# Calculate current tokens from current_usage (actual context)
cur_in=$(echo "$input" | jq -r '.context_window.current_usage.input_tokens // 0')
cur_out=$(echo "$input" | jq -r '.context_window.current_usage.output_tokens // 0')
cache_create=$(echo "$input" | jq -r '.context_window.current_usage.cache_creation_input_tokens // 0')
cache_read=$(echo "$input" | jq -r '.context_window.current_usage.cache_read_input_tokens // 0')
total=$((cur_in + cur_out + cache_create + cache_read))
tokens_k=$(echo "scale=1; $total / 1000" | bc -l)

# Build progress bar (10 chars wide)
bar_width=10
# Ensure we get an integer value for filled (use printf to round)
filled=$(printf "%.0f" $(echo "$used_pct * $bar_width / 100" | bc -l))
# Handle empty result
[ -z "$filled" ] && filled=0
# Ensure filled is within bounds
[ "$filled" -gt "$bar_width" ] && filled=$bar_width
[ "$filled" -lt 0 ] && filled=0
empty=$((bar_width - filled))
# Only use seq if filled/empty > 0 to avoid errors
if [ "$filled" -gt 0 ]; then
  bar_filled=$(printf '%0.s█' $(seq 1 $filled))
else
  bar_filled=""
fi
if [ "$empty" -gt 0 ]; then
  bar_empty=$(printf '%0.s░' $(seq 1 $empty))
else
  bar_empty=""
fi
bar="${bar_filled}${bar_empty}"

# Extract project directory and name
cwd=$(echo "$input" | jq -r '.workspace.current_dir')
project=$(basename "$cwd")

# Get git branch from current working directory (WSL-compatible, skip optional locks)
# Use GIT_OPTIONAL_LOCKS=0 to avoid lock issues in WSL
branch=$(GIT_OPTIONAL_LOCKS=0 git -C "$cwd" rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'no-git')

# Colors
RESET='\033[0m'
MAGENTA='\033[35m'
CYAN='\033[36m'
YELLOW='\033[33m'
BLUE='\033[34m'
GREEN='\033[32m'
RED='\033[31m'

# Color for progress bar based on usage
if [ "$used_pct" -ge 80 ]; then
  BAR_COLOR=$RED
elif [ "$used_pct" -ge 50 ]; then
  BAR_COLOR=$YELLOW
else
  BAR_COLOR=$GREEN
fi

# Output the status line
# Model | Progress Bar + Percentage | Tokens/Window | Branch | Project
printf "${MAGENTA}%s${RESET} | ${BAR_COLOR}%s %s%%${RESET} | ${CYAN}%sK/%sK${RESET} | ${YELLOW}%s${RESET} | ${BLUE}%s${RESET}\n" \
  "$model" "$bar" "$used_pct" "$tokens_k" "$window_k" "$branch" "$project"
