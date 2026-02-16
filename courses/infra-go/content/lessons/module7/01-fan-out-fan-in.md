## Fan-Out / Fan-In

Fan-out: distribute work across multiple goroutines. Fan-in: collect results into one channel.

```go
// Fan-out: launch N workers reading from the same input channel
func fanOut(input <-chan string, workers int) []<-chan Result {
    channels := make([]<-chan Result, workers)
    for i := 0; i < workers; i++ {
        channels[i] = worker(input)
    }
    return channels
}

func worker(input <-chan string) <-chan Result {
    out := make(chan Result)
    go func() {
        defer close(out)
        for item := range input {
            out <- process(item)
        }
    }()
    return out
}

// Fan-in: merge multiple result channels into one
func fanIn(channels ...<-chan Result) <-chan Result {
    var wg sync.WaitGroup
    merged := make(chan Result)

    for _, ch := range channels {
        wg.Add(1)
        go func(c <-chan Result) {
            defer wg.Done()
            for val := range c {
                merged <- val
            }
        }(ch)
    }

    go func() {
        wg.Wait()
        close(merged)
    }()
    return merged
}
```

**Real uses:** Checking N servers in parallel, validating N config files, downloading N artifacts.
