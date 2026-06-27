# Example private overlay

A minimal, copyable scaffold for a pi-stack private overlay. See
[`docs/OVERLAY.md`](../../docs/OVERLAY.md) for the full explanation.

To make your own:

```bash
cp -r examples/overlay ./pi-kit-work     # pi-kit-work/ is gitignored
# edit pi-kit-work/spec.yaml, add your skills under files/.../skills/,
# fill in files/.../capabilities.json, and (for host services) copy
# pi-kit-work/host/overlay_*.go into services/host/.
make run                                 # stacks ./pi-kit-work automatically
```

Layout:

```
overlay/
  spec.yaml                                       # kind: mixin
  overlay.mk                                      # private make targets
  files/
    home/agent/.pi/agent/
      capabilities.json                           # full routing (overwrites public)
      skills/example-data-skill/SKILL.md          # a private skill
    usr/local/bin/example-wrapper                 # an in-sandbox wrapper (sample)
  host/
    overlay_example.go                            # a host plugin (copy into services/host/)
```
