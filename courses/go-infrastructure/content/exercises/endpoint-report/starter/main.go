package main

import (
	"context"
	"io"
	"os"
	"os/signal"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	code := Run(ctx, os.Args[1:], os.Stdout, os.Stderr)
	stop()
	os.Exit(code)
}

// Run implements the behavior in the exercise brief. Add your own helpers.
func Run(ctx context.Context, args []string, out, errOut io.Writer) int {
	return 0
}
