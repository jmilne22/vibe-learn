// Contract test fixture, not a shipped project implementation. Storage internals
// intentionally differ from the briefs: public checks must not inspect them.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"io"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

var kind = "relay"
var timestamp = "arrived"
var broken = ""

type Sample struct {
	Labels map[string]string `json:"labels"`
	T      int64             `json:"t"`
	V      float64           `json:"v"`
}

func main() {
	listen := flag.String("listen", "127.0.0.1:8080", "")
	out := flag.String("out", "events.jsonl", "")
	data := flag.String("data-dir", "data", "")
	flag.Parse()
	var mu sync.Mutex
	count := 0
	samples := []Sample{}
	if kind == "tsdb" {
		b, _ := os.ReadFile(filepath.Join(*data, "snapshot.json"))
		_ = json.Unmarshal(b, &samples)
	}
	server := &http.Server{Addr: *listen, Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		respond := func(code int, v any) { w.WriteHeader(code); _ = json.NewEncoder(w).Encode(v) }
		if r.URL.Path == "/healthz" {
			w.WriteHeader(200)
			return
		}
		if kind == "relay" {
			if r.URL.Path == "/stats" {
				respond(200, map[string]int{"accepted_total": count, "exported_total": count, "queue_depth": 0})
				return
			}
			if r.URL.Path != "/events" {
				w.WriteHeader(404)
				return
			}
			if r.Method != "POST" {
				w.WriteHeader(405)
				return
			}
			bytes, _ := io.ReadAll(io.LimitReader(r.Body, 16385))
			var event map[string]string
			if len(bytes) > 16384 {
				w.WriteHeader(413)
				return
			}
			if json.Unmarshal(bytes, &event) != nil || len(event) != 4 {
				respond(400, "shape")
				return
			}
			for _, k := range []string{"id", "service", "level", "message"} {
				if strings.TrimSpace(event[k]) == "" {
					respond(400, "empty")
					return
				}
			}
			if event["level"] != "info" && event["level"] != "warn" && event["level"] != "error" && event["level"] != "debug" {
				respond(400, "level")
				return
			}
			event[timestamp] = time.Now().UTC().Format(time.RFC3339Nano)
			f, _ := os.OpenFile(*out, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
			if f != nil {
				_ = json.NewEncoder(f).Encode(event)
				f.Close()
			}
			count++
			if broken == "status" {
				w.WriteHeader(200)
			} else {
				w.WriteHeader(202)
			}
			return
		}
		switch r.URL.Path {
		case "/api/v1/write":
			if r.Method != "POST" {
				w.WriteHeader(405)
				return
			}
			bytes, _ := io.ReadAll(r.Body)
			pending := []Sample{}
			last := map[string]int64{}
			for _, s := range samples {
				last[s.Labels["__name__"]+s.Labels["host"]] = s.T
			}
			for n, line := range strings.Split(strings.TrimSpace(string(bytes)), "\n") {
				var s Sample
				if json.Unmarshal([]byte(line), &s) != nil {
					respond(400, n+1)
					return
				}
				key := s.Labels["__name__"] + s.Labels["host"]
				if t, ok := last[key]; ok && s.T <= t {
					respond(400, n+1)
					return
				}
				last[key] = s.T
				pending = append(pending, s)
			}
			samples = append(samples, pending...)
			bytes, _ = json.Marshal(samples)
			_ = os.WriteFile(filepath.Join(*data, "snapshot.json"), bytes, 0600)
			w.WriteHeader(204)
		case "/api/v1/query":
			match := r.URL.Query().Get("match")
			start, _ := strconv.ParseInt(r.URL.Query().Get("start"), 10, 64)
			end, _ := strconv.ParseInt(r.URL.Query().Get("end"), 10, 64)
			if strings.HasSuffix(match, "{") || start > end {
				respond(400, "selector")
				return
			}
			result := []any{}
			points := [][2]float64{}
			var labels map[string]string
			metric := strings.Split(match, "{")[0]
			for _, s := range samples {
				if s.Labels["__name__"] == metric && s.T >= start && s.T <= end {
					labels = s.Labels
					points = append(points, [2]float64{float64(s.T), s.V})
				}
			}
			if len(points) > 0 {
				result = append(result, map[string]any{"labels": labels, "samples": points})
			}
			respond(200, map[string]any{"series": result})
		default:
			w.WriteHeader(404)
		}
	})}
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt)
	go func() { <-stop; _ = server.Shutdown(context.Background()) }()
	_ = server.ListenAndServe()
}
