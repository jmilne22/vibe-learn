package exercise

import (
	"context"
	"errors"
	"testing"
)

func TestContract(t *testing.T) {
	e := errors.New("unavailable")
	calls := 0
	err := Retry(context.Background(), 3, func(context.Context) error { calls++; return e })
	if calls != 3 || !errors.Is(err, e) {
		t.Fatalf("calls=%d err=%v", calls, err)
	}
	calls = 0
	err = Retry(context.Background(), 4, func(context.Context) error {
		calls++
		if calls == 2 {
			return nil
		}
		return e
	})
	if calls != 2 || err != nil {
		t.Fatal("did not stop on success")
	}
	calls = 0
	if err := Retry(context.Background(), 0, func(context.Context) error { calls++; return nil }); err == nil || calls != 0 {
		t.Fatal("invalid budget")
	}
	ctx, cancel := context.WithCancel(context.Background())
	err = Retry(ctx, 1, func(context.Context) error { cancel(); return e })
	if !errors.Is(err, context.Canceled) {
		t.Fatal("lost cancellation")
	}
	calls = 0
	err = Retry(ctx, 2, func(context.Context) error { calls++; return nil })
	if !errors.Is(err, context.Canceled) || calls != 0 {
		t.Fatal("pre-canceled retry")
	}
}
