package exercise

import "sync"

type Counter struct {
	mu sync.Mutex
	n  int
}

func (c *Counter) Add(n int)  { c.mu.Lock(); defer c.mu.Unlock(); c.n += n }
func (c *Counter) Value() int { c.mu.Lock(); defer c.mu.Unlock(); return c.n }
