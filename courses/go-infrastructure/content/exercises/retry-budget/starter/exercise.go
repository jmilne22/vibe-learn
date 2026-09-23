package exercise

import "context"

func Retry(ctx context.Context, attempts int, operation func(context.Context) error) error {
	return nil
}
