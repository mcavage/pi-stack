# Migration manifest

Every gm-team skill and agent role, classified for the move into pi-stack. The
map the cluster work executes against. v1: per-cluster work will refine
individual rows.

**Bins:**
- **CORE** — generic, no proprietary-data dependency. A dependency on the generic memory service counts as core. Ports into pi-stack.
- **HYBRID** — generic spine plus company/connector data. Must degrade gracefully to public/web/memory when the work overlay is absent.
- **OVERLAY** — only meaningful with company data or servers. Lives in `pi-kit-work`, never open-sourced.
- **DROP** — redundant with pi-native session handling or with the memory system already built.

**Fates:** `merge-with-pi-stack-<name>` · `port` · `port+genericize` (strip Docker specifics) · `degrade-without-overlay` (HYBRID contract) · `work-kit-only` · `drop`.

pi-stack already has: brainstorm, investigate, code-review, spec, qa, design-review, ship. pi natively has session save/restore (`--session-dir`, `-c`/`-r`, `--fork`, `/tree`). The memory system covers remember/recall/forget/todo and the synthesis/promotion loop.

---

## Skills

### DROP — already covered (10)

| skill | covered by | note |
|---|---|---|
| recall | memory | the recall extension + `/recall` |
| remember | memory | `/remember` |
| forget | memory | `/forget` |
| todo | memory | task tracking is a memory record type |
| memory-status | memory | a stats readout |
| end-session | memory | the automatic synthesis cadence + session_shutdown |
| context-save | pi-native | `--session-dir`, `-c`/`-r` |
| context-restore | pi-native | same |
| help-gm | n/a | pi-stack writes its own help |
| tool-reference | n/a | references gm-team's tools; rewrite per pi-stack |

### CORE — port into pi-stack (~40)

| skill | depends | fate |
|---|---|---|
| investigate | memory | merge-with-pi-stack-investigate |
| systematic-debugging | none | merge-with-pi-stack-investigate (alias) |
| ship | none | merge-with-pi-stack-ship |
| review | memory | merge-with-pi-stack-code-review |
| write-prd | none | merge-with-pi-stack-spec |
| test-driven-development | none | port (cluster 4) |
| verification-before-completion | none | port (cluster 4) |
| review-gate | none | port (cluster 4) |
| prototype-webapp | none | port |
| wf-prototype | subagents | port (needs agent roster) |
| wf-engineering | memory, subagents | port (needs agent roster) |
| wf-product | memory, subagents | port (needs agent roster) |
| health | none | port |
| self-audit | none | port (merge with health) |
| cso | none | port (security audit) |
| document-release | memory | port |
| ingest | memory | port (feeds memory) |
| improve-system | memory | merge into the memory promotion step (4) |
| git-conventions | none | port |
| api-conventions | none | port |
| conventions | none | port |
| data-conventions | none | port+genericize (drop Snowflake/Opine schema bits) |
| docs-standards | none | port |
| design-system | none | port (cluster 9) |
| anti-slop | none | port (cluster 8) |
| write-like-mark | none | port (Mark's personal voice, applies everywhere he works) |
| microcopy-patterns | none | port |
| draft-email | none | port |
| write-one-pager | none | port |
| slide-deck | none | port |
| challenge | memory | port (cluster 6, complements brainstorm) |
| office-hours | memory | port+genericize (strip the Docker forcing-questions) |
| pm-prioritization | none | port |
| plan-gm-review | memory | port+genericize |
| autoplan | memory | port |
| financial-model | none | port (generic SaaS) |
| saas-benchmarks | none | port (reference) |
| competitive-analysis | memory | port (web + memory; generic) |
| delegation-guide | none | port (subagent delegation patterns) |
| guard | none | port (safety guardrails) |

### HYBRID — generic spine, degrade without the overlay (~19)

| skill | depends | fate |
|---|---|---|
| account-analysis | opine, snowflake, chorus | degrade-without-overlay (web research core) |
| deal-review | opine, snowflake, chorus | degrade-without-overlay |
| account-plan | opine, snowflake, chorus | degrade-without-overlay |
| opportunity-signals | chorus, opine, connectors | degrade-without-overlay (external signals core) |
| wf-gtm-launch | snowflake, opine, connectors | degrade-without-overlay (launch spine generic) |
| wf-strategic-analysis | snowflake, opine | degrade-without-overlay (strategy spine generic) |
| competitive-analysis | — | (also fine as CORE; web-first) |
| meeting-prep | calendar, granola, connectors | degrade-without-overlay |
| meeting-debrief | granola, gws | degrade-without-overlay |
| standup | slack, gws, granola | degrade-without-overlay |
| weekly-wrap | connectors | degrade-without-overlay |
| retro | connectors | degrade-without-overlay |
| refresh-context | connectors | degrade-without-overlay |
| find-internal | notion, gws, granola, slack | degrade-without-overlay |
| setup-user | connectors | degrade-without-overlay (generic onboarding) |
| candidate-prep | bamboohr, granola | degrade-without-overlay |
| employee-feedback-prep | bamboohr | degrade-without-overlay |
| usage-heatmap | snowflake | degrade-without-overlay (generic heatmap render) |
| google-workspace / gdoc-format | gws CLI | needs the gws tool + the user's own auth |

### OVERLAY — work kit only (~10)

| skill | depends | fate |
|---|---|---|
| snowflake | snowflake | work-kit-only (the company schema reference) |
| chorus-sync | chorus | work-kit-only (Chorus ETL) |
| pipeline-review | opine, snowflake, chorus | work-kit-only |
| support-analysis | snowflake, sfdc | work-kit-only |
| wf-sales | opine, snowflake, chorus | work-kit-only |
| wf-board-prep | snowflake, opine | work-kit-only |
| wf-partnership-prep | opine, snowflake | work-kit-only |
| daily-heatmaps | snowflake | work-kit-only (PoC SBX usage) |
| sales-pricing | — | work-kit-only (Docker pricing) |
| brand-voice | — | work-kit-only (Docker brand) |

**Skill counts:** ~40 CORE, ~19 HYBRID, ~10 OVERLAY, 10 DROP. Roughly half port straight into the open core; a fifth are hybrids needing the degrade contract; a tenth are work-only; a tenth are already done.

---

## Agents (from `team.yaml`)

| agent | bin | model | depends | fate |
|---|---|---|---|---|
| architect | CORE | opus | memory | port-to-pi-crew |
| engineer | CORE | opus | memory | port-to-pi-crew |
| designer | CORE | opus | memory | port-to-pi-crew |
| product-manager | CORE | opus | memory, notion | port-to-pi-crew |
| qa-lead | CORE | haiku | memory | port-to-pi-crew |
| security-lead | CORE | opus | memory | port-to-pi-crew |
| sre-lead | CORE | sonnet | memory | port-to-pi-crew |
| devrel | CORE | opus | memory | port-to-pi-crew |
| dx-consultant | CORE | opus | memory | port-to-pi-crew |
| enterprise-admin | CORE | opus | memory | port-to-pi-crew |
| finance-analyst | CORE | opus | memory, opine | port-to-pi-crew (opine optional) |
| growth-marketing | CORE | sonnet | memory, opine, notion | port-to-pi-crew (connectors optional) |
| legal | CORE | opus | memory, notion | port-to-pi-crew |
| ux-copywriter | CORE | sonnet | memory, notion | port-to-pi-crew |
| code-reviewer | CORE | gemini | memory | fold into the review preset (cross-vendor) |
| peer-reviewer | CORE | gpt | memory | fold into the review preset (cross-vendor) |
| gm | GLUE | sonnet-1m | memory, etc. | becomes the orchestration layer (pi-crew) |
| gtm-lead | GLUE | sonnet-1m | memory | orchestration layer |
| product-lead | GLUE | sonnet-1m | memory | orchestration layer |
| strategy-lead | GLUE | sonnet-1m | memory | orchestration layer |
| data-analyst | OVERLAY | sonnet-1m | snowflake, chorus, jira | work-kit-only |
| sales | OVERLAY | sonnet-1m | chorus, granola, opine | work-kit-only |
| people-ops | OVERLAY | opus | bamboohr | work-kit-only |

**14 CORE specialists + 2 cross-vendor reviewers** are the candidate set for a real pi-crew team, far richer than today's 3 presets (fanout/deep/review). **4 GLUE** roles become the orchestration layer. **3 OVERLAY** roles stay in the work kit. (Reconciliation note: the sub-agent classed code-reviewer/peer-reviewer as work-only; they're generic cross-model reviewers with no company data, so they're CORE and fold into the review preset.)

---

## What this tells us about sequencing

- **The open core is ~40 CORE skills + ~14 CORE agents.** That's a real, shareable pi-stack, mostly unblocked now that memory exists.
- **The HYBRID contract is the one new engineering pattern** the port needs: a skill checks for its overlay tool and degrades (web/memory) when absent. Build it once, apply to ~19 skills.
- **The work overlay is small and well-bounded:** ~10 OVERLAY skills + 3 agents + 5 MCP servers (opine, snowflake-proxy, chorus, bamboohr, slack). A clean second kit.
- **The wf-\* workflows and the richer team depend on the agent roster** (cluster 12 / pi-crew), so that's a gate for the orchestration-heavy skills.

Suggested order: dev-workflow clusters (2-5) first (mostly CORE, highest use), then writing/decide (6, 8), then the agent roster (12) to unblock the wf-\* skills, then the HYBRID contract + the work overlay kit last.
</content>
