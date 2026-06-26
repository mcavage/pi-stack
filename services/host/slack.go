// Slack MCP server (host side, stdio). Port of the former mcp/slack/server.ts.
//
// A stdio MCP server registered with sbx (`sbx mcp add slack --command
// pi-stack-host --args slack --env SLACK_TOKEN=…`); the Docker MCP gateway runs it
// on the host and exposes it to the agent, so the Slack user token never enters
// the VM. Talks to the Slack Web API directly. No local cache.
//
// Env: SLACK_TOKEN (user token xoxp-; SLACK_USER_TOKEN/SLACK_BOT_TOKEN fallbacks),
// SLACK_TEAM_ID (optional).

package main

import (
	"errors"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
)

const slackAPI = "https://slack.com/api"
const slackSession = "pi-stack-slack"

func slackToken() (string, error) {
	for _, k := range []string{"SLACK_TOKEN", "SLACK_USER_TOKEN", "SLACK_BOT_TOKEN"} {
		if v := strings.TrimSpace(envRaw(k)); v != "" {
			return v, nil
		}
	}
	return "", errors.New("SLACK_TOKEN environment variable is not set")
}

// slackCall posts application/x-www-form-urlencoded with the bearer; checks ok.
func slackCall(method string, params map[string]string) (jsonObj, error) {
	tok, err := slackToken()
	if err != nil {
		return nil, err
	}
	form := url.Values{}
	if t := strings.TrimSpace(envRaw("SLACK_TEAM_ID")); t != "" {
		if _, ok := params["team_id"]; !ok {
			form.Set("team_id", t)
		}
	}
	for k, v := range params {
		if v != "" {
			form.Set(k, v)
		}
	}
	body, status, err := httpPostForm(slackAPI+"/"+method, tok, form)
	if err != nil {
		return nil, err
	}
	if status != 200 {
		return nil, errors.New("Slack " + method + " HTTP " + http.StatusText(status))
	}
	obj, err := parseJSONObj(body)
	if err != nil {
		return nil, err
	}
	if ok, _ := obj["ok"].(bool); !ok {
		e, _ := obj["error"].(string)
		if e == "" {
			e = "unknown_error"
		}
		return nil, errors.New("Slack " + method + " failed: " + e)
	}
	return obj, nil
}

// --- user-name cache ---------------------------------------------------------
var (
	slackUserMu    sync.Mutex
	slackUserNames = map[string]string{}
)

func slackResolveUsers(ids []string) {
	seen := map[string]bool{}
	for _, id := range ids {
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		slackUserMu.Lock()
		_, have := slackUserNames[id]
		slackUserMu.Unlock()
		if have {
			continue
		}
		name := id
		if obj, err := slackCall("users.info", map[string]string{"user": id}); err == nil {
			u, _ := obj["user"].(map[string]any)
			name = slackBestName(u, id)
		}
		slackUserMu.Lock()
		slackUserNames[id] = name
		slackUserMu.Unlock()
	}
}

func slackBestName(u jsonObj, fallback string) string {
	if u == nil {
		return fallback
	}
	prof, _ := u["profile"].(map[string]any)
	for _, v := range []string{getStr(prof, "display_name"), getStr(prof, "real_name"), getStr(u, "real_name"), getStr(u, "name")} {
		if v != "" {
			return v
		}
	}
	return fallback
}

func slackNameFor(id string) string {
	if id == "" {
		return ""
	}
	slackUserMu.Lock()
	defer slackUserMu.Unlock()
	if n, ok := slackUserNames[id]; ok {
		return n
	}
	return id
}

func slackCompactMessage(m jsonObj) jsonObj {
	user := getStr(m, "user")
	if user == "" {
		user = getStr(m, "bot_id")
	}
	out := jsonObj{"ts": m["ts"], "user": user, "text": m["text"]}
	if un := slackNameFor(getStr(m, "user")); un != "" {
		out["user_name"] = un
	}
	if tt := getStr(m, "thread_ts"); tt != "" && tt != getStr(m, "ts") {
		out["thread_ts"] = tt
	}
	if rc, ok := m["reply_count"]; ok {
		out["reply_count"] = rc
	}
	return out
}

func slackEnrich(msgs []any) []jsonObj {
	ids := []string{}
	for _, mm := range msgs {
		if m, ok := mm.(map[string]any); ok {
			if u := getStr(m, "user"); u != "" {
				ids = append(ids, u)
			}
		}
	}
	slackResolveUsers(ids)
	out := []jsonObj{}
	for _, mm := range msgs {
		if m, ok := mm.(map[string]any); ok {
			out = append(out, slackCompactMessage(m))
		}
	}
	return out
}

// --- tool handlers -----------------------------------------------------------
func slackToolHandlers() map[string]func(jsonObj) (any, error) {
	return map[string]func(jsonObj) (any, error){
		"health": func(jsonObj) (any, error) {
			a, err := slackCall("auth.test", nil)
			if err != nil {
				return nil, err
			}
			return jsonObj{"success": true, "team": a["team"], "team_id": a["team_id"], "user": a["user"], "user_id": a["user_id"]}, nil
		},
		"search_messages": func(p jsonObj) (any, error) {
			q := getStr(p, "query")
			if strings.TrimSpace(q) == "" {
				return jsonObj{"success": false, "error": "query is required"}, nil
			}
			data, err := slackCall("search.messages", map[string]string{
				"query": q, "count": itoaClamp(p["count"], 20, 1, 100),
				"sort": getStrOr(p, "sort", "score"), "sort_dir": getStrOr(p, "sort_dir", "desc"),
				"page": itoaClamp(p["page"], 1, 1, 100000),
			})
			if err != nil {
				return nil, err
			}
			msgs, _ := data["messages"].(map[string]any)
			matchesAny, _ := msgs["matches"].([]any)
			ids := []string{}
			for _, mm := range matchesAny {
				if m, ok := mm.(map[string]any); ok {
					if u := getStr(m, "user"); u != "" {
						ids = append(ids, u)
					}
				}
			}
			slackResolveUsers(ids)
			matches := []jsonObj{}
			for _, mm := range matchesAny {
				m, _ := mm.(map[string]any)
				c := slackCompactMessage(m)
				ch, _ := m["channel"].(map[string]any)
				c["channel_id"] = getStr(ch, "id")
				c["channel_name"] = getStr(ch, "name")
				c["permalink"] = m["permalink"]
				matches = append(matches, c)
			}
			return jsonObj{"success": true, "total": msgs["total"], "matches": matches}, nil
		},
		"list_channels": func(p jsonObj) (any, error) {
			data, err := slackCall("conversations.list", map[string]string{
				"types": getStrOr(p, "types", "public_channel"), "limit": itoaClamp(p["limit"], 100, 1, 1000),
				"exclude_archived": "true", "cursor": getStr(p, "cursor"),
			})
			if err != nil {
				return nil, err
			}
			q := strings.ToLower(strings.TrimSpace(getStr(p, "query")))
			chans := []jsonObj{}
			arr, _ := data["channels"].([]any)
			for _, cc := range arr {
				c, _ := cc.(map[string]any)
				name := getStr(c, "name")
				if q != "" && !strings.Contains(strings.ToLower(name), q) {
					continue
				}
				chans = append(chans, jsonObj{"id": getStr(c, "id"), "name": name,
					"is_private": c["is_private"], "num_members": c["num_members"],
					"topic": getStr(getMap(c, "topic"), "value"), "purpose": getStr(getMap(c, "purpose"), "value")})
			}
			return jsonObj{"success": true, "channels": chans, "count": len(chans), "next_cursor": getStr(getMap(data, "response_metadata"), "next_cursor")}, nil
		},
		"read_channel": func(p jsonObj) (any, error) {
			ch := getStr(p, "channel_id")
			if strings.TrimSpace(ch) == "" {
				return jsonObj{"success": false, "error": "channel_id is required"}, nil
			}
			data, err := slackCall("conversations.history", map[string]string{
				"channel": ch, "limit": itoaClamp(p["limit"], 50, 1, 100),
				"oldest": getStr(p, "oldest"), "latest": getStr(p, "latest"), "cursor": getStr(p, "cursor"),
			})
			if err != nil {
				return nil, err
			}
			msgs, _ := data["messages"].([]any)
			return jsonObj{"success": true, "channel_id": ch, "messages": slackEnrich(msgs),
				"has_more": data["has_more"], "next_cursor": getStr(getMap(data, "response_metadata"), "next_cursor")}, nil
		},
		"read_thread": func(p jsonObj) (any, error) {
			ch, ts := getStr(p, "channel_id"), getStr(p, "thread_ts")
			if ch == "" || ts == "" {
				return jsonObj{"success": false, "error": "channel_id and thread_ts are required"}, nil
			}
			data, err := slackCall("conversations.replies", map[string]string{
				"channel": ch, "ts": ts, "limit": itoaClamp(p["limit"], 100, 1, 1000), "cursor": getStr(p, "cursor"),
			})
			if err != nil {
				return nil, err
			}
			msgs, _ := data["messages"].([]any)
			return jsonObj{"success": true, "channel_id": ch, "thread_ts": ts, "messages": slackEnrich(msgs),
				"has_more": data["has_more"], "next_cursor": getStr(getMap(data, "response_metadata"), "next_cursor")}, nil
		},
		"get_user": func(p jsonObj) (any, error) {
			in := strings.TrimSpace(getStr(p, "user"))
			if in == "" {
				return jsonObj{"success": false, "error": "user is required (id or email)"}, nil
			}
			var obj jsonObj
			var err error
			if strings.Contains(in, "@") {
				obj, err = slackCall("users.lookupByEmail", map[string]string{"email": in})
			} else {
				obj, err = slackCall("users.info", map[string]string{"user": in})
			}
			if err != nil {
				return nil, err
			}
			u, _ := obj["user"].(map[string]any)
			prof := getMap(u, "profile")
			return jsonObj{"success": true, "user": jsonObj{"id": getStr(u, "id"), "name": getStr(u, "name"),
				"real_name": getStr(prof, "real_name"), "display_name": getStr(prof, "display_name"),
				"email": getStr(prof, "email"), "title": getStr(prof, "title"), "is_bot": u["is_bot"], "deleted": u["deleted"]}}, nil
		},
		"search_users": func(p jsonObj) (any, error) {
			q := strings.ToLower(strings.TrimSpace(getStr(p, "query")))
			if q == "" {
				return jsonObj{"success": false, "error": "query is required"}, nil
			}
			max := clampInt(p["limit"], 50, 1, 200)
			matches := []jsonObj{}
			cursor := ""
			for pages := 0; pages < 20 && len(matches) < max; pages++ {
				data, err := slackCall("users.list", map[string]string{"limit": "200", "cursor": cursor})
				if err != nil {
					return nil, err
				}
				members, _ := data["members"].([]any)
				for _, mm := range members {
					u, _ := mm.(map[string]any)
					if b, _ := u["deleted"].(bool); b {
						continue
					}
					if b, _ := u["is_bot"].(bool); b {
						continue
					}
					prof := getMap(u, "profile")
					hay := strings.ToLower(strings.Join([]string{getStr(u, "name"), getStr(u, "real_name"), getStr(prof, "real_name"), getStr(prof, "display_name"), getStr(prof, "email")}, " "))
					if strings.Contains(hay, q) {
						matches = append(matches, jsonObj{"id": getStr(u, "id"), "name": getStr(u, "name"),
							"real_name": getStr(prof, "real_name"), "display_name": getStr(prof, "display_name"),
							"email": getStr(prof, "email"), "title": getStr(prof, "title")})
						if len(matches) >= max {
							break
						}
					}
				}
				cursor = getStr(getMap(data, "response_metadata"), "next_cursor")
				if cursor == "" {
					break
				}
			}
			sort.SliceStable(matches, func(i, j int) bool { return getStr(matches[i], "name") < getStr(matches[j], "name") })
			return jsonObj{"success": true, "users": matches, "count": len(matches)}, nil
		},
	}
}

func slackTools() []mcpTool {
	s := func(d string) jsonObj { return jsonObj{"type": "string", "description": d} }
	n := func(d string) jsonObj { return jsonObj{"type": "number", "description": d} }
	return []mcpTool{
		{"health", "Check Slack MCP server health and the authenticated identity (auth.test).", jsonObj{}, nil},
		{"search_messages", "Search Slack messages with Slack search syntax (e.g. 'in:#dev from:@jane release'). Needs a user token.",
			jsonObj{"query": s("Slack search query"), "count": n("1-100 (default 20)"), "sort": s("'score' or 'timestamp'"), "sort_dir": s("'desc' or 'asc'"), "page": n("1-based page")}, []string{"query"}},
		{"list_channels", "List channels (optionally filtered by a name substring).",
			jsonObj{"query": s("name substring filter"), "types": s("public_channel,private_channel,mpim,im"), "limit": n("1-1000"), "cursor": s("next_cursor")}, nil},
		{"read_channel", "Read recent messages from a channel (conversations.history), user names resolved.",
			jsonObj{"channel_id": s("Channel id e.g. C0ABC123"), "limit": n("1-100 (default 50)"), "oldest": s("Unix ts"), "latest": s("Unix ts"), "cursor": s("next_cursor")}, []string{"channel_id"}},
		{"read_thread", "Read all replies in a thread (conversations.replies), user names resolved.",
			jsonObj{"channel_id": s("Channel id"), "thread_ts": s("parent message ts"), "limit": n("1-1000 (default 100)"), "cursor": s("next_cursor")}, []string{"channel_id", "thread_ts"}},
		{"get_user", "Look up a user by id (U...) or email.", jsonObj{"user": s("Slack user id or email")}, []string{"user"}},
		{"search_users", "Find users by a substring of name, display name, or email.",
			jsonObj{"query": s("substring"), "limit": n("1-200 (default 50)")}, []string{"query"}},
	}
}

// Slack is registered with sbx via `sbx mcp add slack --command pi-stack-host
// --args slack --env SLACK_TOKEN=…`; the gateway runs it on the host as a stdio
// MCP server and exposes it to the agent. (No HTTP, no mcp.json url entry.)
func runSlack() {
	handle := mcpDispatcher("pi-stack-slack", slackTools(), slackToolHandlers())
	mcpStdio(handle)
}
