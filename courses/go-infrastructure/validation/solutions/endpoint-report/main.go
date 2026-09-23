package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"sync"
	"time"
)

type config struct {
	Targets   []string `json:"targets"`
	Workers   int      `json:"workers"`
	TimeoutMS int      `json:"timeout_ms"`
}
type result struct {
	Target string `json:"target"`
	Status int    `json:"status"`
	Error  string `json:"error,omitempty"`
}

func readConfig(name string) (config, error) {
	var c config
	f, err := os.Open(name)
	if err != nil {
		return c, err
	}
	defer f.Close()
	d := json.NewDecoder(f)
	d.DisallowUnknownFields()
	if err := d.Decode(&c); err != nil {
		return config{}, err
	}
	var extra any
	if err := d.Decode(&extra); err != io.EOF {
		return config{}, fmt.Errorf("expected one JSON object")
	}
	if len(c.Targets) == 0 || c.Workers < 1 || c.Workers > 16 || c.TimeoutMS < 1 || c.TimeoutMS > 60000 {
		return config{}, fmt.Errorf("need targets, workers 1..16, timeout_ms 1..60000")
	}
	for _, s := range c.Targets {
		u, err := url.Parse(s)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || u.User != nil {
			return config{}, fmt.Errorf("invalid target %q", s)
		}
	}
	return c, nil
}

func probe(ctx context.Context, client *http.Client, target string) result {
	r := result{Target: target}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		r.Error = err.Error()
		return r
	}
	response, err := client.Do(request)
	if err != nil {
		r.Error = err.Error()
		return r
	}
	defer response.Body.Close()
	r.Status = response.StatusCode
	return r
}

func Run(ctx context.Context, args []string, out, errOut io.Writer) int {
	flags := flag.NewFlagSet("endpoint-report", flag.ContinueOnError)
	flags.SetOutput(errOut)
	name := flags.String("config", "", "JSON configuration path")
	if err := flags.Parse(args); err != nil {
		return 2
	}
	if *name == "" || flags.NArg() != 0 {
		fmt.Fprintln(errOut, "usage: endpoint-report -config FILE")
		return 2
	}
	c, err := readConfig(*name)
	if err != nil {
		fmt.Fprintln(errOut, "config:", err)
		return 2
	}
	if err := ctx.Err(); err != nil {
		fmt.Fprintln(errOut, err)
		return 1
	}
	// Do not follow redirects: report the configured endpoint's response.
	client := &http.Client{Timeout: time.Duration(c.TimeoutMS) * time.Millisecond, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	defer client.CloseIdleConnections()
	results := make([]result, len(c.Targets))
	jobs := make(chan int)
	var wg sync.WaitGroup
	for w := 0; w < min(c.Workers, len(c.Targets)); w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range jobs {
				if ctx.Err() != nil {
					continue
				}
				results[i] = probe(ctx, client, c.Targets[i])
			}
		}()
	}
schedule:
	for i := range c.Targets {
		select {
		case <-ctx.Done():
			break schedule
		case jobs <- i:
		}
	}
	close(jobs)
	wg.Wait()
	if err := ctx.Err(); err != nil {
		fmt.Fprintln(errOut, err)
		return 1
	}
	code := 0
	for _, r := range results {
		if r.Error != "" || r.Status < 200 || r.Status >= 300 {
			code = 1
		}
	}
	if err := json.NewEncoder(out).Encode(results); err != nil {
		fmt.Fprintln(errOut, "write report:", err)
		return 1
	}
	return code
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	code := Run(ctx, os.Args[1:], os.Stdout, os.Stderr)
	stop()
	os.Exit(code)
}
