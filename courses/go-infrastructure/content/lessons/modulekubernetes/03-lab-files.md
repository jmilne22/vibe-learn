## Kubernetes lab files

These are the complete supplied files. Create each path relative to your isolated `LAB_ROOT`, or use the matching files under `courses/go-infrastructure/labs` in the repository. They are included here so the recipe remains readable offline. Do not paste the headings or code fences into files.

<details>
<summary>fixture/go.mod</summary>

```text
module example.com/course-fixture

go 1.26
```

</details>

<details>
<summary>fixture/main.go</summary>

```go
// A deliberately small lab fixture, not an OTLP storage backend.
package main

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync/atomic"
	"syscall"
	"time"
)

func main() {
	var reject atomic.Bool
	var batches atomic.Int64
	mux := http.NewServeMux()
	mux.HandleFunc("GET /ready", func(w http.ResponseWriter, r *http.Request) {
		if reject.Load() {
			http.Error(w, "not ready", 503)
			return
		}
		io.WriteString(w, "ready\n")
	})
	mux.HandleFunc("GET /live", func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "alive\n") })
	mux.HandleFunc("GET /version", func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, os.Getenv("VERSION")+"\n") })
	// Unauthenticated control is intentional for an isolated local lab only.
	mux.HandleFunc("POST /control", func(w http.ResponseWriter, r *http.Request) {
		reject.Store(r.URL.Query().Get("fail") == "true")
		w.WriteHeader(204)
	})
	mux.HandleFunc("GET /stats", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]int64{"received_batches": batches.Load()})
	})
	mux.HandleFunc("POST /v1/logs", func(w http.ResponseWriter, r *http.Request) {
		if reject.Load() {
			http.Error(w, "receiver unavailable", 503)
			return
		}
		if _, err := io.Copy(io.Discard, http.MaxBytesReader(w, r.Body, 1<<20)); err != nil {
			http.Error(w, err.Error(), 413)
			return
		}
		count := batches.Add(1)
		log.Printf("accepted batch %d", count)
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, "{}")
	})
	mux.HandleFunc("GET /work", func(w http.ResponseWriter, r *http.Request) {
		delay, err := time.ParseDuration(r.URL.Query().Get("duration"))
		if err != nil || delay < 0 || delay > 10*time.Second {
			http.Error(w, "duration must be 0..10s", 400)
			return
		}
		log.Print("work started")
		timer := time.NewTimer(delay)
		defer timer.Stop()
		select {
		case <-timer.C:
			io.WriteString(w, "work complete\n")
			log.Print("work completed")
		case <-r.Context().Done():
			log.Print("work canceled")
		}
	})
	server := &http.Server{Addr: ":8080", Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	stopped := make(chan struct{})
	signals, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-signals.Done()
		reject.Store(true)
		log.Print("shutdown started")
		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()
		if err := server.Shutdown(ctx); err != nil {
			log.Printf("shutdown: %v", err)
			server.Close()
		}
		close(stopped)
	}()
	log.Print("listening :8080")
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
	<-stopped
	log.Print("shutdown complete")
}
```

</details>

<details>
<summary>fixture/Dockerfile</summary>

```dockerfile
FROM scratch
COPY server /server
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/server"]
```

</details>

<details>
<summary>kubernetes/chart/Chart.yaml</summary>

```yaml
apiVersion: v2
name: endpoint-lab
version: 0.1.0
description: Local course fixture for rollout and routing investigations
```

</details>

<details>
<summary>kubernetes/chart/values.yaml</summary>

```yaml
image: vibe-course-fixture:1
version: first
serviceTarget: endpoint-lab
readinessPath: /ready
replicas: 1
```

</details>

<details>
<summary>kubernetes/chart/templates/workload.yaml</summary>

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: endpoint-lab
spec:
  replicas: {{ .Values.replicas }}
  progressDeadlineSeconds: 60
  strategy:
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1
  selector:
    matchLabels:
      app: endpoint-lab
  template:
    metadata:
      labels:
        app: endpoint-lab
    spec:
      terminationGracePeriodSeconds: 15
      containers:
        - name: endpoint
          image: {{ .Values.image | quote }}
          imagePullPolicy: Never
          env:
            - name: VERSION
              value: {{ .Values.version | quote }}
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: 25m
              memory: 16Mi
            limits:
              cpu: 200m
              memory: 64Mi
          readinessProbe:
            httpGet:
              path: {{ .Values.readinessPath | quote }}
              port: 8080
            periodSeconds: 2
          livenessProbe:
            httpGet:
              path: /live
              port: 8080
            periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: endpoint-lab
spec:
  selector:
    app: {{ .Values.serviceTarget | quote }}
  ports:
    - port: 80
      targetPort: 8080
```

</details>
