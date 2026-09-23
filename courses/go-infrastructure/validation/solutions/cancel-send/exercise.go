package exercise

import "context"

func Send(ctx context.Context, out chan<- int, value int) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	select {
	case out <- value:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
