// Example host overlay plugin. COPY this into services/host/ (it must be in the
// same package/dir as the rest of pi-stack-host to compile in). Files named
// services/host/overlay_*.go are gitignored by default, so your private host
// services stay out of git while compiling into the binary.
//
// The public binary builds identically without this file: extraCommands,
// extraUsage and extraServiceFactories are declared (empty) in main.go, and this
// init() populates them only when the file is present.
//
// This template is NOT compiled where it sits (examples/overlay/host/ is not a Go
// package); it's a copy-me reference.

package main

import "net/http"

// init self-registers the plugin. Renaming/removing the file removes the service.
func init() {
	// 1) a one-shot subcommand: `pi-stack-host example`
	extraCommands["example"] = runExample
	extraUsage = append(extraUsage, "  example      example private host service  [overlay]")

	// 2) (optional) a long-running HTTP service that `make serve` starts when
	//    "example" is in SERVICES. Reach it from the sandbox over
	//    host.docker.internal:12000 via an in-sandbox wrapper.
	extraServiceFactories = append(extraServiceFactories, func() hostService {
		return hostService{
			"example",
			env("EXAMPLE_BIND", "127.0.0.1") + ":" + env("EXAMPLE_PORT", "12000"),
			exampleMux(),
		}
	})
}

func runExample() {
	addr := env("EXAMPLE_BIND", "127.0.0.1") + ":" + env("EXAMPLE_PORT", "12000")
	_ = http.ListenAndServe(addr, exampleMux())
}

func exampleMux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"ok": "example overlay service"})
	})
	return mux
}
