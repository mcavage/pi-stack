// pi-stack-host — the single compiled binary for everything that runs on the
// HOST (outside the sandbox). Convention: host code is Go (one static binary, no
// interpreter spawning child processes — the shape EDR trusts); in-sandbox code
// (pi extensions, in-box MCP) is TypeScript.
//
// Subcommands (one per host service):
//
//	gws-token    Google Workspace bearer svc (:11441, HTTP)
//	memory       self-learning memory store  (:11435, JSON-RPC)
//	slack        Slack read/search MCP       (stdio; run by the sbx gateway)
//	serve        run the long-running HTTP services together (gws-token, memory)
//
// The MCP server (slack) is stdio and spawned by the sbx gateway via `sbx mcp
// add` (see `make mcp-register`), not by `serve`.
//
// Company-specific integrations (a data-warehouse exec proxy, an HR-directory MCP)
// live in a private overlay: when their source files are present in the build they
// self-register here via init(); the public tree ships without them.

package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
)

// Overlay subcommands/services self-register here via init() when their (private,
// gitignored) source files are present in the build. Empty in the public tree.
var (
	extraCommands         = map[string]func(){}
	extraUsage            []string
	extraServiceFactories []func() hostService
	// extraServiceAliases maps a config-friendly SERVICES name to the internal
	// service name a factory registers (e.g. a short "warehouse" -> "warehouse-proxy").
	// Overlay plugins add their own here so the public tree never names one.
	extraServiceAliases = map[string]string{}
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	switch os.Args[1] {
	case "gws-token":
		runGwsToken()
	case "slack":
		runSlack()
	case "memory":
		runMemory()
	case "serve":
		runServe(os.Args[2:])
	case "-h", "--help", "help":
		usage()
	default:
		if fn := extraCommands[os.Args[1]]; fn != nil {
			fn()
			return
		}
		fmt.Fprintf(os.Stderr, "pi-stack-host: unknown subcommand %q\n\n", os.Args[1])
		usage()
		os.Exit(2)
	}
}

func usage() {
	fmt.Fprint(os.Stderr, `pi-stack-host — host-side services for pi-stack

usage: pi-stack-host <subcommand>

subcommands:
  gws-token    Google Workspace short-lived bearer service (:11441)
  memory       self-learning memory store, JSON-RPC (:11435)
  slack        Slack read/search MCP server (stdio; run by the sbx gateway)
  serve        run the long-running HTTP services (gws-token, memory)
`)
	for _, line := range extraUsage {
		fmt.Fprintln(os.Stderr, line)
	}
}

// --- small shared helpers ----------------------------------------------------

func env(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func decodeJSON(r *http.Request, v any) error {
	return json.NewDecoder(r.Body).Decode(v)
}
