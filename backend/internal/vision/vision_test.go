package vision

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/anthropics/anthropic-sdk-go/v2"
	"github.com/anthropics/anthropic-sdk-go/v2/option"
)

// fakeAPI answers like the Messages API with the given stop reason and text, and keeps the request.
func fakeAPI(t *testing.T, stop, text string) (*Claude, *map[string]any, *http.Header) {
	t.Helper()
	got, hdr := map[string]any{}, http.Header{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		json.Unmarshal(b, &got)
		hdr = r.Header.Clone()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"id": "msg_1", "type": "message", "role": "assistant", "model": Model, "stop_reason": stop,
			"content": []any{map[string]any{"type": "text", "text": text}},
			"usage":   map[string]any{"input_tokens": 1, "output_tokens": 1},
		})
	}))
	t.Cleanup(srv.Close)
	c := &Claude{client: anthropic.NewClient(option.WithAPIKey("test"), option.WithBaseURL(srv.URL), option.WithMaxRetries(0))}
	return c, &got, &hdr
}

var req = Request{
	Kind: "cow", Guide: "width: front wall length", Notes: "about 30 m long",
	Schema: json.RawMessage(`{"type":"object","properties":{"notes":{"type":"string"}},"required":["notes"],"additionalProperties":false}`),
	Photos: []Photo{{Type: "image/jpeg", Data: []byte{1, 2, 3}}, {Type: "image/png", Data: []byte{4}}},
}

func TestSuggestSendsPhotosAndSchema(t *testing.T) {
	c, got, hdr := fakeAPI(t, "end_turn", `{"notes":"red barn"}`)
	out, err := c.Suggest(context.Background(), req)
	if err != nil || string(out) != `{"notes":"red barn"}` {
		t.Fatalf("answer: %s %v", out, err)
	}
	g := *got
	if g["model"] != Model {
		t.Fatalf("model: %v", g["model"])
	}
	if g["fallbacks"] != "default" || !strings.Contains(hdr.Get("anthropic-beta"), "server-side-fallback-2026-07-01") {
		t.Fatalf("declined requests fall back: %v %q", g["fallbacks"], hdr.Get("anthropic-beta"))
	}
	oc := g["output_config"].(map[string]any)
	if oc["effort"] != "high" || oc["format"].(map[string]any)["type"] != "json_schema" {
		t.Fatalf("output config: %v", oc)
	}
	content := g["messages"].([]any)[0].(map[string]any)["content"].([]any)
	images := 0
	for _, b := range content {
		if b.(map[string]any)["type"] == "image" {
			images++
		}
	}
	last := content[len(content)-1].(map[string]any)["text"].(string)
	if images != 2 || !strings.Contains(last, "width: front wall length") || !strings.Contains(last, "about 30 m long") || !strings.Contains(last, "cow") {
		t.Fatalf("photos, guide and notes are sent: %d images, %q", images, last)
	}
}

func TestSuggestFailuresAreExplained(t *testing.T) {
	for stop, want := range map[string]string{"refusal": "declined", "max_tokens": "cut off"} {
		c, _, _ := fakeAPI(t, stop, `{}`)
		_, err := c.Suggest(context.Background(), req)
		var e Error
		if !errors.As(err, &e) || !strings.Contains(string(e), want) {
			t.Fatalf("%s: %v", stop, err)
		}
	}
	c, _, _ := fakeAPI(t, "end_turn", `not json`)
	if _, err := c.Suggest(context.Background(), req); err == nil {
		t.Fatal("an answer that isn't JSON is an error")
	}
}
