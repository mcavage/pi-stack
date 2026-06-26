#!/usr/bin/env bash
# Open-core boundary guard. The entire safety story is "company/overlay content
# stays out of the public repo + image." That rests on two hand-maintained
# allowlists (.gitignore and .dockerignore) that MUST mirror each other, and on
# nothing company-specific being git-tracked outside them. This asserts both —
# build-free, so it runs in public CI without the DHI base image.
#
# Exit non-zero (and say why) on any drift or leak.
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0
note() { echo "FAIL: $*"; fail=1; }

# Pull the "!<dir>/<name>" allowlist out of an ignore file for a given prefix,
# normalized (no leading '!', no trailing '/'), sorted.
allow() { # $1=file $2=prefix(skills|agents)
  grep -E "^!$2/" "$1" 2>/dev/null | sed -E "s#^!##; s#/\$##" | sort -u
}

for kind in skills agents; do
  g="$(allow .gitignore "$kind")"
  d="$(allow .dockerignore "$kind")"
  # agents are tracked as files (agents/foo.md); strip .md so the two lists,
  # which both list bare names per kind, compare on the same axis.
  if [ "$g" != "$d" ]; then
    note "$kind allowlists differ between .gitignore and .dockerignore:"
    diff <(echo "$g") <(echo "$d") | sed 's/^/    /' || true
  fi
done

# No tracked skill dir may sit outside the .dockerignore allowlist. Only real
# skills (skills/<name>/...) count; bare files like skills/.gitkeep are scaffold.
allowed_skills="$(allow .dockerignore skills)"
for d in $(git ls-files skills/ | grep -E '^skills/[^/]+/' | sed -E 's#^(skills/[^/]+)/.*#\1#' | sort -u); do
  echo "$allowed_skills" | grep -qx "$d" || note "tracked skill not in allowlist (would leak): $d"
done

# No tracked agent file may sit outside the allowlist (compare paths verbatim —
# the allowlist lists agents/<name>.md, same as git ls-files).
allowed_agents="$(allow .dockerignore agents)"
for f in $(git ls-files agents/ | sort -u); do
  echo "$allowed_agents" | grep -qx "$f" || note "tracked agent not in allowlist (would leak): $f"
done

# Private overlay sources must never be tracked — they self-register into the
# binary when present locally, but the public tree builds without them.
overlay_tracked="$(git ls-files services/host/snowproxy.go services/host/bamboohr.go services/host/snowproxy_test.go bin/snow config/overlay.mk 2>/dev/null)"
if [ -n "$overlay_tracked" ]; then
  note "private overlay file(s) are tracked (must stay gitignored):"
  echo "$overlay_tracked" | sed 's/^/    /'
fi

# Belt-and-suspenders: no internal-only marker may appear in any tracked file.
# NOTE: capture the output and test it — do NOT pipe into `grep -q` under
# `set -o pipefail`: xargs exits 123 when any batch finds no match, which
# pipefail propagates, making the `if` read "clean" even when markers are present.
markers='UH65063|gm-agent-team|gm-team|hivemind|CANON\.GOLD|op://Employee|CrowdStrike'
# Exclude this script from the scan — it necessarily contains the marker list itself.
marker_hits="$(git ls-files -z | grep -zvF 'scripts/check-open-core.sh' | xargs -0 grep -nIE "$markers" 2>/dev/null || true)"
if [ -n "$marker_hits" ]; then
  note "internal marker(s) found in tracked file(s):"
  echo "$marker_hits" | sed 's/^/    /'
fi

if [ "$fail" -eq 0 ]; then
  echo "open-core boundary OK: skills + agents allowlists mirror, tracked tree clean."
fi
exit "$fail"
