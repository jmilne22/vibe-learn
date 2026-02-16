## Practice Strategy

### How to Learn Patterns

1. **Recognize the pattern** — Read the problem, identify which pattern applies
2. **Write the skeleton** — Set up the data structure (map, two pointers, window)
3. **Fill in the logic** — The invariant that defines your solution
4. **Verify with examples** — Walk through with small inputs

### Pattern Recognition Cheat Sheet

| Signal in Problem | Try This Pattern |
|---|---|
| "Find pair that sums to X" | Hash map or two pointers (if sorted) |
| "Count occurrences" | Hash map frequency counting |
| "Longest subarray with condition" | Sliding window |
| "Find in sorted data" | Binary search |
| "Matching/nesting" | Stack |
| "Minimum needed to satisfy" | Binary search on answer |
| "Merge sorted inputs" | Two pointers |
| "Next greater/smaller element" | Monotonic stack |

### Interview Mindset

1. **State the pattern** before coding: "This is a sliding window problem because..."
2. **Start with brute force**, then optimize: "Brute force is O(n²), but with a map we get O(n)"
3. **Think out loud** — interviewers care about your reasoning, not just the answer
4. **Test edge cases:** empty input, single element, all same values

---
