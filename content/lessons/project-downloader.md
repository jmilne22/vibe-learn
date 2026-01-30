## Project Goals

Build a concurrent file downloader:

1. Accept list of URLs from file or stdin
2. Download files in parallel (configurable workers)
3. Show progress bar for each download
4. Handle errors gracefully (retry failed downloads)
5. Support cancellation with Ctrl+C

## Components to Use

- `sync.WaitGroup` — coordinate workers
- `context.Context` — for cancellation
- `channels` — for progress updates
- `semaphore pattern` — limit concurrent downloads

## Suggested Structure

*Worker pattern*

```go
func worker(ctx context.Context, urls chan string, results chan Result) {
    for url := range urls {
        select {
        case <-ctx.Done():
            return
        default:
            result := download(ctx, url)
            results <- result
        }
    }
}

func download(ctx context.Context, url string) Result {
    req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        return Result{URL: url, Err: err}
    }
    defer resp.Body.Close()
    
    // Download and track progress...
    return Result{URL: url, Size: size}
}
```

## Example Usage

*Terminal*

```bash
$ cat urls.txt | downloader -workers 5
Downloading 10 files with 5 workers...
[████████████████████] 100% file1.zip (15 MB)
[████████████░░░░░░░░]  60% file2.tar.gz (8/13 MB)
[████░░░░░░░░░░░░░░░░]  20% file3.iso (200/1000 MB)
...
```

> **Skills Used:** <p>Goroutines, channels, WaitGroups, context cancellation, HTTP streaming, progress tracking.</p>
