## Sliding Window

Sliding windows process subarrays or substrings efficiently.

### Fixed Window: Moving Average

```go
// Average CPU utilization over last k samples
func movingAverage(samples []float64, k int) []float64 {
    if len(samples) < k {
        return nil
    }
    // Compute initial window sum
    var windowSum float64
    for i := 0; i < k; i++ {
        windowSum += samples[i]
    }
    averages := []float64{windowSum / float64(k)}

    // Slide the window
    for i := k; i < len(samples); i++ {
        windowSum += samples[i] - samples[i-k] // add new, remove old
        averages = append(averages, windowSum/float64(k))
    }
    return averages
}
```

O(n) — each element is added and removed exactly once.

### Variable Window: Longest Streak

```go
// Longest streak of "healthy" status without any "error"
func longestHealthyStreak(statuses []string) int {
    maxLen := 0
    left := 0
    for right := 0; right < len(statuses); right++ {
        if statuses[right] == "error" {
            left = right + 1 // shrink: start fresh after error
        }
        if right-left+1 > maxLen {
            maxLen = right - left + 1
        }
    }
    return maxLen
}
```

### Variable Window: At Most K Errors

```go
// Longest subarray with at most k errors
func longestWithKErrors(statuses []string, k int) int {
    maxLen := 0
    errorCount := 0
    left := 0
    for right := 0; right < len(statuses); right++ {
        if statuses[right] == "error" {
            errorCount++
        }
        for errorCount > k {
            if statuses[left] == "error" {
                errorCount--
            }
            left++ // shrink until we have ≤ k errors
        }
        if right-left+1 > maxLen {
            maxLen = right - left + 1
        }
    }
    return maxLen
}
```

**The pattern:** Expand right to grow the window. If the window breaks a constraint, shrink from left until it's valid again.

<div class="inline-exercises" data-concept="Sliding Window"></div>
