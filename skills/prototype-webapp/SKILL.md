---
name: prototype-webapp
description: Build a working web prototype with all interactive states. Use for "build a prototype", "make a demo", "show me what this could look like", or to validate a design before speccing the real thing. Pairs with design-system, design-review, and qa.
---
# prototype-webapp

A prototype is a forcing function for real decisions, not a staging environment
for a future rewrite. Build only what forces the decisions.

## Clarify first (one question)
Ask: demo (polished, realistic fake data, no backend) or functional (real data,
real API)? The answer determines everything that follows. If the user is unsure,
default to demo.

## Pick the top 3 interactions
List all the things the prototype could show. Pick the 3 that most directly
answer the question the prototype exists to answer. Build those; skip everything
else. If the user pushes back, add at most one more.

## Shape by type
| Prototype type | Default shape |
|---|---|
| Landing / marketing page | Plain HTML + CSS, no framework |
| Dashboard / data view | React + recharts for any charts |
| Admin / CRUD | React + Table + Dialog + Form |

Default to the lightest shape that works. Don't pull in a framework to avoid
writing 20 lines of CSS.

## Build rules (non-negotiable)
- Single file, under 500 lines. If you're over, you're showing too much.
- Realistic data. No "Lorem ipsum", no "Item 1 / Item 2", no placeholder images.
  Invent plausible names, numbers, dates.
- Every click works. No dead buttons, no "coming soon" states.
- Build every state per `design-system`: empty, loading, error, populated,
  overflow, permission denied. Each state must be reachable in the prototype
  (a toggle or a URL param is fine; invisible code is not).
- Mobile responsive. Dark mode if the rest of the product has it.

## After building
1. Run `design-review` to screenshot and score the finished UI.
2. Run `qa` to exercise every state.
3. If the prototype is approved and needs to become real, hand the decisions it
   surfaced to `spec` to write proper stories before any production code.
