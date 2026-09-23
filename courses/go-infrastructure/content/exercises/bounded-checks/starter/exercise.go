package exercise

import "context"

type Result struct {
	Target string
	Code   int
	Err    error
}

func CheckAll(ctx context.Context, targets []string, limit int, check func(context.Context, string) (int, error)) ([]Result, error) {
	return nil, nil
}
