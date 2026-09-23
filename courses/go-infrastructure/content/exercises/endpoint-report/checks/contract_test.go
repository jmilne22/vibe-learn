package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func configuration(t *testing.T, text string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(p, []byte(text), 0600); err != nil {
		t.Fatal(err)
	}
	return p
}
func TestContract(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/ok":
			w.WriteHeader(204)
		case "/redirect":
			w.Header().Set("Location", "/ok")
			w.WriteHeader(302)
		default:
			w.WriteHeader(503)
		}
	}))
	defer s.Close()
	for _, tc := range []struct {
		paths []string
		want  int
	}{{[]string{"/ok"}, 0}, {[]string{"/ok", "/bad", "/redirect"}, 1}} {
		targets := []string{}
		for _, p := range tc.paths {
			targets = append(targets, s.URL+p)
		}
		data, _ := json.Marshal(map[string]any{"targets": targets, "workers": 2, "timeout_ms": 1000})
		var out, errOut bytes.Buffer
		code := Run(context.Background(), []string{"-config", configuration(t, string(data))}, &out, &errOut)
		if code != tc.want {
			t.Fatalf("exit=%d want %d: %s", code, tc.want, errOut.String())
		}
		var results []struct {
			Target string `json:"target"`
			Status int    `json:"status"`
			Error  string `json:"error"`
		}
		if err := json.Unmarshal(out.Bytes(), &results); err != nil || len(results) != len(targets) {
			t.Fatalf("report: %s (%v)", out.String(), err)
		}
		for i, r := range results {
			want := 204
			if tc.paths[i] == "/bad" {
				want = 503
			}
			if tc.paths[i] == "/redirect" {
				want = 302
			}
			if r.Target != targets[i] || r.Status != want || r.Error != "" {
				t.Fatalf("result %d: %+v", i, r)
			}
		}
	}
}
func TestInvalidConfig(t *testing.T) {
	for _, s := range []string{`{}`, `{"targets":["http://x"],"workers":1,"timeout_ms":0}`, `{"targets":["ftp://x"],"workers":1,"timeout_ms":5}`, `{"targets":["http://x"],"workers":17,"timeout_ms":5}`, `{"targets":["http://x"],"workers":1,"timeout_ms":5,"typo":1}`, `{"targets":["http://x"],"workers":1,"timeout_ms":5} {}`} {
		var out, errOut bytes.Buffer
		if code := Run(context.Background(), []string{"-config", configuration(t, s)}, &out, &errOut); code != 2 || out.Len() != 0 || errOut.Len() == 0 {
			t.Fatalf("invalid config %s: code=%d out=%q err=%q", s, code, out.String(), errOut.String())
		}
	}
	var out, errOut bytes.Buffer
	if Run(context.Background(), nil, &out, &errOut) != 2 {
		t.Fatal("missing flag")
	}
}
func TestTimeoutAndCancellation(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { <-r.Context().Done() }))
	defer s.Close()
	p := configuration(t, fmt.Sprintf(`{"targets":[%q],"workers":1,"timeout_ms":20}`, s.URL))
	var out, errOut bytes.Buffer
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if code := Run(ctx, []string{"-config", p}, &out, &errOut); code != 1 {
		t.Fatalf("timeout exit=%d", code)
	}
	var results []struct {
		Status int
		Error  string
	}
	if err := json.Unmarshal(out.Bytes(), &results); err != nil || len(results) != 1 || results[0].Status != 0 || results[0].Error == "" {
		t.Fatalf("timeout report: %s", out.String())
	}
	cancel()
	out.Reset()
	errOut.Reset()
	if Run(ctx, []string{"-config", p}, &out, &errOut) != 1 || out.Len() != 0 {
		t.Fatal("canceled run emitted partial report")
	}
}

type failedWriter struct{}

func (failedWriter) Write([]byte) (int, error) { return 0, errors.New("disk full") }
func TestOutputFailure(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) }))
	defer s.Close()
	p := configuration(t, fmt.Sprintf(`{"targets":[%q],"workers":1,"timeout_ms":1000}`, s.URL))
	var errOut bytes.Buffer
	if Run(context.Background(), []string{"-config", p}, failedWriter{}, &errOut) != 1 || errOut.Len() == 0 {
		t.Fatal("write failure ignored")
	}
}
