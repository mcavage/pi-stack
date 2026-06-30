// `serve` runs the long-running HTTP host services (gws-token, memory, plus any
// overlay services that self-register when present), each on its own port, in one
// process. The MCP servers (slack) are stdio and spawned on demand by the sbx
// gateway, not here.

package main

import (
	"log"
	"net/http"
	"sort"
	"strings"
)

type hostService struct {
	name string
	addr string
	mux  http.Handler
}

// runServe starts the long-running HTTP host services. `enabled` is the list
// from `SERVICES` in config/local.mk (config-friendly aliases: memory, gws, plus
// any overlay registers); empty means "all". The MCP servers (e.g. slack) are
// stdio commands run by the sbx gateway via `sbx mcp add`, not HTTP daemons.
func runServe(enabled []string) {
	all := []hostService{
		{"gws-token", env("GWS_TOKEN_BIND", "127.0.0.1") + ":" + env("GWS_TOKEN_PORT", "11441"), gwsTokenMux()},
		{"memory", env("MEMORY_BIND", "127.0.0.1") + ":" + env("MEMORY_PORT", "11435"), memoryMux()},
	}
	// Overlay services (e.g. a warehouse proxy) self-register via init() when present.
	for _, f := range extraServiceFactories {
		all = append(all, f())
	}
	// config-friendly aliases -> internal service name. Built-ins, plus each
	// service's own name as an identity alias, plus any overlay-registered aliases
	// (extraServiceAliases) — so the public tree never hardcodes an overlay name.
	alias := map[string]string{
		"gws": "gws-token", "gws-token": "gws-token",
		"memory": "memory",
	}
	for _, s := range all {
		alias[s.name] = s.name
	}
	for k, v := range extraServiceAliases {
		alias[k] = v
	}
	valid := make([]string, 0, len(alias))
	for k := range alias {
		valid = append(valid, k)
	}
	sort.Strings(valid)
	want := map[string]bool{}
	for _, e := range enabled {
		if e == "" {
			continue
		}
		n, ok := alias[e]
		if !ok {
			log.Fatalf("serve: unknown service %q (valid: %s)", e, strings.Join(valid, ", "))
		}
		want[n] = true
	}
	started := 0
	for _, s := range all {
		if len(want) > 0 && !want[s.name] {
			continue
		}
		s := s
		log.Printf("starting %s on http://%s", s.name, s.addr)
		go func() {
			if err := http.ListenAndServe(s.addr, s.mux); err != nil {
				log.Fatalf("%s: %v", s.name, err)
			}
		}()
		started++
	}
	if started == 0 {
		log.Fatal("serve: no services enabled (set SERVICES in config/local.mk, e.g. SERVICES = memory gws)")
	}
	select {} // block forever; the goroutines serve
}
