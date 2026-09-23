package exercise

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"
)

func TestContract(t *testing.T) {
	var active, peak atomic.Int32
	entered := make(chan struct{}, 3)
	release := make(chan struct{})
	done := make(chan []Result, 1)
	go func() {
		r, _ := CheckAll(context.Background(), []string{"a", "b", "c"}, 2, func(context.Context, string) (int, error) {
			n := active.Add(1)
			for old := peak.Load(); n > old && !peak.CompareAndSwap(old, n); old = peak.Load() {
			}
			entered <- struct{}{}
			<-release
			active.Add(-1)
			return 200, nil
		})
		done <- r
	}()
	for i := 0; i < 2; i++ {
		select {
		case <-entered:
		case <-time.After(2 * time.Second):
			close(release)
			t.Fatal("two workers did not start")
		}
	}
	close(release)
	var got []Result
	select {
	case got = <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("workers did not finish")
	}
	if peak.Load() > 2 || len(got) != 3 {
		t.Fatalf("peak=%d results=%v", peak.Load(), got)
	}
	for i, s := range []string{"a", "b", "c"} {
		if got[i].Target != s || got[i].Code != 200 {
			t.Fatal("wrong order or result")
		}
	}
	sentinel := errors.New("offline")
	got, err := CheckAll(context.Background(), []string{"x"}, 1, func(context.Context, string) (int, error) { return 0, sentinel })
	if err != nil || len(got) != 1 || !errors.Is(got[0].Err, sentinel) {
		t.Fatal("per-target error lost")
	}
	if _, err := CheckAll(context.Background(), nil, 0, nil); err == nil {
		t.Fatal("invalid limit accepted")
	}
	ctx, cancel := context.WithCancel(context.Background())
	started := make(chan struct{})
	finished := make(chan error, 1)
	var stopped atomic.Bool
	go func() {
		_, err := CheckAll(ctx, []string{"x", "y"}, 1, func(ctx context.Context, _ string) (int, error) {
			close(started)
			<-ctx.Done()
			stopped.Store(true)
			return 0, ctx.Err()
		})
		finished <- err
	}()
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		cancel()
		t.Fatal("callback did not start")
	}
	cancel()
	select {
	case err := <-finished:
		if !errors.Is(err, context.Canceled) || !stopped.Load() {
			t.Fatal("returned before cancellation cleanup")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("cancellation stuck")
	}
	calls := 0
	_, err = CheckAll(ctx, []string{"x"}, 1, func(context.Context, string) (int, error) { calls++; return 200, nil })
	if !errors.Is(err, context.Canceled) || calls != 0 {
		t.Fatal("pre-canceled batch started work")
	}
}
