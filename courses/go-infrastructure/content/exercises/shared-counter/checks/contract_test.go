package exercise

import (
	"sync"
	"testing"
)

func TestContract(t *testing.T) {
	var c Counter
	if c.Value() != 0 {
		t.Fatal("zero value")
	}
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				c.Add(1)
				_ = c.Value()
			}
		}()
	}
	wg.Wait()
	if c.Value() != 2000 {
		t.Fatalf("got %d; want 2000", c.Value())
	}
	c.Add(-1)
	if c.Value() != 1999 {
		t.Fatal("negative addition")
	}
}
