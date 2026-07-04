## Hash Maps: The Universal Solver

Maps solve a huge class of problems by giving you O(1) lookup.

<attempt type="pretest">

<predict prompt="What does this print?">
```go
counts := map[string]int{"Running": 3}
counts["Pending"]++
fmt.Println(counts["Pending"], counts["Failed"])
```
```
1 0
```
</predict>

Wrong is fine — every counting pattern below leans on exactly this behavior.

</attempt>

### Two Sum Pattern

<attempt type="worked">

The classic: find two numbers that add to a target. Brute force is O(n²). A map makes it O(n):

```go
// Find two server latencies that sum to a target SLA budget
func twoSum(latencies []int, target int) (int, int) {
    seen := make(map[int]int) // value → index
    for i, lat := range latencies {
        complement := target - lat
        if j, ok := seen[complement]; ok {
            return j, i
        }
        seen[lat] = i
    }
    return -1, -1
}
```

**The insight:** For each element, ask "have I already seen its complement?" Instead of searching the whole array, check the map.

</attempt>

### Frequency Counting

```go
// Count pod statuses across a cluster
func countStatuses(pods []string) map[string]int {
    counts := make(map[string]int)
    for _, status := range pods {
        counts[status]++
    }
    return counts
}
// Input: ["Running", "Running", "Pending", "Failed", "Running"]
// Output: map[Running:3 Pending:1 Failed:1]
```

### Grouping

```go
// Group pods by namespace
func groupByNamespace(pods []Pod) map[string][]Pod {
    groups := make(map[string][]Pod)
    for _, pod := range pods {
        groups[pod.Namespace] = append(groups[pod.Namespace], pod)
    }
    return groups
}
```

### Deduplication

```go
// Deduplicate alert names while preserving order
func dedup(alerts []string) []string {
    seen := make(map[string]bool)
    var result []string
    for _, alert := range alerts {
        if !seen[alert] {
            seen[alert] = true
            result = append(result, alert)
        }
    }
    return result
}
```

**When to reach for a map:** "Have I seen this before?", "How many of each?", "Group by X", "Find pairs".

<attempt type="gaps">

<gaps prompt="Which two pods together fill the node's memory exactly? One pass — check before you insert.">
```go
seen := make(map[int]int) // memMB → index
for i, mem := range pods {
    need := «capacity - mem»
    if j, ok := «seen[need]»; ok {
        return j, i
    }
    «seen[mem]» = i
}
return -1, -1
```
</gaps>

Inserting only after the check is what lets the pair meet on its second element — and it stops an element from matching itself.

</attempt>

<attempt type="scratch">

<div class="inline-exercises" data-concept="Hash Maps"></div>

</attempt>
