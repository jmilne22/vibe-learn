package exercise

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestContract(t *testing.T) {
	ch := make(chan int, 1)
	if err := Send(context.Background(), ch, 7); err != nil || len(ch) != 1 {
		t.Fatal("did not send")
	}
	if <-ch != 7 {
		t.Fatal("wrong value")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := Send(ctx, ch, 8); !errors.Is(err, context.Canceled) || len(ch) != 0 {
		t.Fatal("already canceled send")
	}
	ctx, cancel = context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- Send(ctx, make(chan int), 9) }()
	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatal(err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("blocked send did not stop")
	}
	ch <- 10
}
