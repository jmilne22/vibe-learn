## Binary Search

Binary search finds a value (or a boundary) in O(log n).

### Classic Binary Search

```go
// Find a config version in a sorted version list
func findVersion(versions []string, target string) int {
    lo, hi := 0, len(versions)-1
    for lo <= hi {
        mid := lo + (hi-lo)/2 // avoid overflow vs (lo+hi)/2
        if versions[mid] == target {
            return mid
        } else if versions[mid] < target {
            lo = mid + 1
        } else {
            hi = mid - 1
        }
    }
    return -1 // not found
}
```

### Go's sort.Search

```go
import "sort"

// Find the first version >= "v1.5.0"
versions := []string{"v1.2.0", "v1.3.0", "v1.5.0", "v1.6.0", "v2.0.0"}
i := sort.SearchStrings(versions, "v1.5.0")
// i == 2

// Generic: find first index where f(i) is true
i = sort.Search(len(versions), func(i int) bool {
    return versions[i] >= "v1.5.0"
})
```

### Binary Search on the Answer

"What's the minimum number of servers to handle N requests, given each server handles at most M?"

```go
// Binary search on answer: minimum servers needed
func minServers(requests int, perServer int) int {
    lo, hi := 1, requests
    for lo < hi {
        mid := lo + (hi-lo)/2
        if mid*perServer >= requests {
            hi = mid // might be enough
        } else {
            lo = mid + 1 // not enough
        }
    }
    return lo
}
```

**The pattern:** When the answer is monotonic (if X servers work, X+1 also works), binary search the answer space.

<div class="inline-exercises" data-concept="Binary Search"></div>
