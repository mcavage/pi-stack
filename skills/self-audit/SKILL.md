---
name: self-audit
description: System self-audit. Confirms the harness is healthy, keys, the memory service, the full agent roster, and the skills all load and respond. Use for "self-audit", "is everything working", "check the system", after a build or config change.
---
# self-audit

Run after a build or config change, or when something feels off. Call the actual
tools and report actual results. Do not assume success.

**Iron law: no step is optional. Skipping a step and marking it OK is a false signal.**

## 1. Environment
```bash
for k in ANTHROPIC_API_KEY OPENAI_API_KEY; do
  [ -n "${!k}" ] && echo "OK: $k" || echo "FAIL: $k missing"
done
[ -n "$GEMINI_API_KEY" ] && echo "OK: GEMINI_API_KEY" || echo "optional: GEMINI_API_KEY unset"
```
Anthropic and OpenAI are required (the model cycle and the cross-vendor `review`
agent). Gemini is optional. MCP servers are optional too: `mcp` reporting 0
servers is normal unless a kit wired some.

## 2. Memory service
```bash
curl -s -m3 -X POST "${MEMORY_URL:-http://host.docker.internal:11435}" \
  -d '{"jsonrpc":"2.0","id":1,"method":"stats"}' || echo "no memory service"
```
A stats response means recall and capture are live. "no memory service" means the
host has not started it (`make memory-serve` on the host); the harness still works,
recall is just empty.

## 3. Agent roster
List every agent the harness actually exposes (the real roster, not a hardcoded set):
```bash
ls ~/.pi/agent/agents/*.md 2>/dev/null | xargs -n1 basename | sed 's/\.md$//' | tr '\n' ' '; echo
```
Expect the three presets (fanout, deep, review) plus the specialists: architect,
engineer, designer, product-manager, qa-lead, security-lead, sre-lead, devrel,
dx-consultant, legal, finance-analyst, growth-marketing, ux-copywriter,
enterprise-admin. Report the full list, and flag any you expected but do not see.

Then smoke-test one agent per model tier in parallel via the Agent tool (a trivial
task each, confirm a sane reply): a haiku-tier role (`qa-lead` or `fanout`), an
opus-tier role (`architect` or `deep`), and the cross-vendor `review`. Report each:
role, model, ok or slow or fail. Three is enough to prove every model family and
the dispatch path; you do not need to invoke all fourteen.

## 4. Skills
```bash
ls ~/.pi/agent/skills | wc -l
```
Report the count (expect dozens) and spot-check that two or three have a non-empty
SKILL.md.

## 5. Tool routing
Confirm scoping holds: a read-only role (`fanout`, `qa-lead`) has no write/edit in
its `tools:`, and a builder (`engineer`) does. Read the frontmatter to check.

## Report
A table of each check with OK / FAIL / optional and a one-line note. Verdict is
ALL CLEAR only when keys, the roster, and skills are healthy. A missing memory
service, Gemini key, or MCP server is optional, not a failure.
