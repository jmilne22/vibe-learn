package exercise

type Counter struct{ n int }

func (c *Counter) Add(n int)  {}
func (c *Counter) Value() int { return 0 }
