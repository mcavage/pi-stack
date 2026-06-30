---
name: example-data-skill
description: Example private overlay skill. Replace with your own. Demonstrates asking for a capability (not a vendor) so the skill stays portable.
---
# example-data-skill

A private skill that lives only in your overlay. Use it for proprietary data or
workflows you don't want in the public repo.

Write **capabilities, not vendors** so the skill resolves through whatever you've
wired in your overlay's `capabilities.json`:

> Pull **warehouse** (the numbers) and **crm** (the narrative) in parallel. Resolve
> each via `capability-routing`. If a capability is `none`, say so and degrade to
> web/files.

That keeps the skill portable and keeps vendor names out of the skill text.
