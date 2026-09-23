package exercise

import (
	"context"
	"fmt"
)

func Retry(ctx context.Context, attempts int, operation func(context.Context) error) error {
	if attempts < 1 {
		return fmt.Errorf("attempts must be positive")
	}
	var last error
	for i := 0; i < attempts; i++ {
		if err := ctx.Err(); err != nil {
			return err
		}
		last = operation(ctx)
		if last == nil {
			return nil
		}
		if err := ctx.Err(); err != nil {
			return err
		}
	}
	return last
}
