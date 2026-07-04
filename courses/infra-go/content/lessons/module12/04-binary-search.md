## Binary Search

Binary search finds a value (or a boundary) in O(log n).

<attempt type="pretest">

<predict prompt="v1.5.0 is not in the list. What does this print?">
```go
versions := []string{"v1.2.0", "v1.3.0", "v1.6.0", "v2.0.0"}
fmt.Println(sort.SearchStrings(versions, "v1.5.0"))
```
```
2
```
</predict>

Wrong is fine — the sort.Search section below explains the rule.

</attempt>

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

<attempt type="worked">

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

</attempt>

<attempt type="gaps">

<gaps prompt="Exact-match binary search over sorted latencies — mind the loop condition and how each boundary moves past mid.">
```go
lo, hi := 0, len(latencies)-1
for «lo <= hi» {
    mid := lo + «(hi-lo)/2»
    switch {
    case latencies[mid] == target:
        return mid
    case latencies[mid] < target:
        «lo = mid + 1»
    default:
        «hi = mid - 1»
    }
}
return -1
```
</gaps>

Compare with the boundary search above: the loop condition and the `hi` move are both different, and mixing the two styles is the classic infinite-loop bug.

</attempt>

<attempt type="scratch">

<div class="inline-exercises" data-concept="Binary Search"></div>

</attempt>
