package main

import (
	"strings"
	"testing"
)

func TestMemFtsQuery(t *testing.T) {
	cases := map[string]string{
		"Hello World":        `"hello" OR "world"`,
		"a, b, c!":           `""`, // single-char tokens dropped
		"Go for host-svc 99": `"go" OR "for" OR "host" OR "svc" OR "99"`,
		"":                   "",
	}
	for in, want := range cases {
		if in == "a, b, c!" {
			want = "" // all tokens len<=1 -> empty
		}
		if got := memFtsQuery(in); got != want {
			t.Errorf("memFtsQuery(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestMemCosine(t *testing.T) {
	if got := memCosine([]float64{1, 0}, []float64{1, 0}); got < 0.999 {
		t.Errorf("identical vectors cosine = %v, want ~1", got)
	}
	if got := memCosine([]float64{1, 0}, []float64{0, 1}); got != 0 {
		t.Errorf("orthogonal cosine = %v, want 0", got)
	}
	if got := memCosine([]float64{1, 2, 3}, []float64{1, 2}); got != 0 {
		t.Errorf("dimension mismatch cosine = %v, want 0 (safe)", got)
	}
	if got := memCosine([]float64{0, 0}, []float64{1, 1}); got != 0 {
		t.Errorf("zero vector cosine = %v, want 0", got)
	}
}

func TestClampInt(t *testing.T) {
	if clampInt(float64(5), 0, 1, 10) != 5 {
		t.Error("float64 in-range")
	}
	if clampInt(float64(99), 0, 1, 10) != 10 {
		t.Error("clamp hi")
	}
	if clampInt(nil, 7, 1, 10) != 7 {
		t.Error("nil -> default")
	}
	if clampInt("3", 0, 1, 10) != 3 {
		t.Error("string numeric")
	}
}

func TestMcpDispatcher(t *testing.T) {
	tools := []mcpTool{{Name: "echo", Description: "echo", Properties: jsonObj{}, Required: nil}}
	handlers := map[string]func(jsonObj) (any, error){
		"echo": func(a jsonObj) (any, error) { return jsonObj{"said": a["msg"]}, nil },
	}
	h := mcpDispatcher("test", tools, handlers)

	// initialize
	rep, ok := h(jsonObj{"jsonrpc": "2.0", "id": float64(1), "method": "initialize"})
	if !ok || rep["result"].(jsonObj)["serverInfo"].(jsonObj)["name"] != "test" {
		t.Fatalf("initialize bad reply: %v", rep)
	}
	// tools/list
	rep, ok = h(jsonObj{"id": float64(2), "method": "tools/list"})
	if !ok || len(rep["result"].(jsonObj)["tools"].([]jsonObj)) != 1 {
		t.Fatalf("tools/list bad reply: %v", rep)
	}
	// tools/call
	rep, _ = h(jsonObj{"id": float64(3), "method": "tools/call", "params": map[string]any{"name": "echo", "arguments": map[string]any{"msg": "hi"}}})
	txt := rep["result"].(jsonObj)["content"].([]jsonObj)[0]["text"].(string)
	if !strings.Contains(txt, "hi") {
		t.Fatalf("tools/call result missing payload: %q", txt)
	}
	// notification -> no reply
	if _, ok := h(jsonObj{"method": "notifications/initialized"}); ok {
		t.Fatal("notification should produce no reply")
	}
	// unknown tool -> error
	rep, _ = h(jsonObj{"id": float64(4), "method": "tools/call", "params": map[string]any{"name": "nope"}})
	if _, isErr := rep["error"]; !isErr {
		t.Fatal("unknown tool should error")
	}
}

func TestMemStoreRememberRecall(t *testing.T) {
	st, err := newMemStore(":memory:", nil) // nil embedder -> FTS-only, no Ollama needed
	if err != nil {
		t.Fatal(err)
	}
	r, err := st.remember(rememberInput{content: "The user prefers Go for host services and TypeScript in the sandbox."})
	if err != nil {
		t.Fatal(err)
	}
	if b, _ := r["reaffirmed"].(bool); b {
		t.Fatal("first remember should not be a reaffirm")
	}

	hits, err := st.recall("what language for host services", 8, 1200, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if len(hits) == 0 || !strings.Contains(hits[0].content, "Go for host services") {
		t.Fatalf("recall did not surface the fact: %+v", hits)
	}

	// exact-duplicate remember -> reaffirmed, no new row
	r2, _ := st.remember(rememberInput{content: "The user prefers Go for host services and TypeScript in the sandbox."})
	if b, _ := r2["reaffirmed"].(bool); !b {
		t.Fatal("duplicate remember should reaffirm")
	}
	if st.stats()["active"].(int) != 1 {
		t.Fatalf("expected 1 active memory, got %v", st.stats()["active"])
	}

	// forget by id prefix
	id := r["id"].(string)
	if !st.forget(id[:8]) {
		t.Fatal("forget by 8-char prefix should succeed")
	}
	if st.stats()["active"].(int) != 0 {
		t.Fatal("expected 0 active after forget")
	}
}

// Exercises the recall scoring/ordering — specifically the project-match branch,
// which the single-row test never hit. Two equally-relevant facts (same query
// terms, same length) must order by project: the current-project one first.
func TestRecallOrdering(t *testing.T) {
	st, err := newMemStore(":memory:", nil) // FTS-only, deterministic
	if err != nil {
		t.Fatal(err)
	}
	mk := func(content, project string) {
		if _, err := st.remember(rememberInput{content: content, project: project, hasProject: true}); err != nil {
			t.Fatal(err)
		}
	}
	mk("alpha beta gamma", "proj")  // current project
	mk("alpha beta delta", "other") // different project — same relevance, lower factor

	hits, err := st.recall("alpha beta", 8, 100000, "", "proj")
	if err != nil {
		t.Fatal(err)
	}
	if len(hits) != 2 {
		t.Fatalf("want 2 hits, got %d: %+v", len(hits), hits)
	}
	if !strings.Contains(hits[0].content, "gamma") {
		t.Errorf("project-match memory should rank first; got order: %q then %q", hits[0].content, hits[1].content)
	}
	if hits[0].score <= hits[1].score {
		t.Errorf("scores not strictly ordered: %v <= %v", hits[0].score, hits[1].score)
	}
}

// guards the FTS query never produces a syntactically broken MATCH (would panic
// the recall path); ensures special chars are stripped, not passed through.
func TestMemFtsQuerySafe(t *testing.T) {
	for _, in := range []string{`a "b" c`, `drop; table--`, `*`, `()`} {
		q := memFtsQuery(in)
		if strings.ContainsAny(q, `;*()`) {
			t.Errorf("memFtsQuery(%q) = %q leaked an unsafe char", in, q)
		}
	}
}
