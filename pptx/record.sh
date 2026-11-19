#!/usr/bin/env bash
# Records every demo clip for storyboard.yaml in the order the money flows need:
# fresh Ion -> read-only screens and drought -> APIA advance -> pension
# -> six months forward. The drought is read-only and is recorded at 15 November, as its slide says. Needs `npm run dev` (web :5173 + api :3001).
# Run: bash pptx/record.sh
set -euo pipefail
export PYTHONUTF8=1
# ffmpeg from winget, in case this shell started before it was on PATH
export PATH="$PATH:$(dirname "$(find "$LOCALAPPDATA/Microsoft/WinGet/Packages" -name ffmpeg.exe 2>/dev/null | head -1)")"
cd "$(dirname "$0")"
DECK="python $HOME/.claude/skills/demo-deck/scripts/make_deck.py storyboard.yaml"

(cd .. && npm run seed:demo)
node --env-file=../.env save-login.cjs
$DECK capture --force --only calendar-gap,onboarding,subsidy-range,assistant,drought
$DECK capture --force --only advance-in
$DECK capture --force --only pension-start
$DECK capture --force --only time-forward
echo "All clips recorded. Run: npm run seed:demo to reset Ion for the live demo."
