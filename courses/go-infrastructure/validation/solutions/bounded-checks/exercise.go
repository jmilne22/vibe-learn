package exercise

import (
	"context"
	"fmt"
	"sync"
)

type Result struct {
	Target string
	Code   int
	Err    error
}

func CheckAll(ctx context.Context, targets []string, limit int, check func(context.Context, string) (int, error)) ([]Result, error) {
	if limit < 1 {
		return nil, fmt.Errorf("limit must be positive")
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	results := make([]Result, len(targets))
	jobs := make(chan int)
	var wg sync.WaitGroup
	for w := 0; w < min(limit, len(targets)); w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range jobs {
				if ctx.Err() != nil {
					continue
				}
				code, err := check(ctx, targets[i])
				results[i] = Result{targets[i], code, err}
			}
		}()
	}
schedule:
	for i := range targets {
		select {
		case <-ctx.Done():
			break schedule
		case jobs <- i:
		}
	}
	close(jobs)
	wg.Wait()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return results, nil
}
