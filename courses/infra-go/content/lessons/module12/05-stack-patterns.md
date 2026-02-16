## Stack Patterns

Stacks solve problems with matching, nesting, and ordering.

### Matching Brackets

```go
// Validate config syntax: matching brackets
func isValid(s string) bool {
    stack := []byte{}
    pairs := map[byte]byte{')': '(', ']': '[', '}': '{'}
    for i := 0; i < len(s); i++ {
        ch := s[i]
        if ch == '(' || ch == '[' || ch == '{' {
            stack = append(stack, ch)
        } else if match, ok := pairs[ch]; ok {
            if len(stack) == 0 || stack[len(stack)-1] != match {
                return false
            }
            stack = stack[:len(stack)-1] // pop
        }
    }
    return len(stack) == 0
}
```

### Monotonic Stack: Next Greater Element

```go
// For each server load, find the next time a higher load occurs
func nextGreaterElement(loads []int) []int {
    result := make([]int, len(loads))
    for i := range result {
        result[i] = -1 // default: no greater element
    }
    stack := []int{} // indices
    for i, load := range loads {
        for len(stack) > 0 && loads[stack[len(stack)-1]] < load {
            top := stack[len(stack)-1]
            stack = stack[:len(stack)-1]
            result[top] = load
        }
        stack = append(stack, i)
    }
    return result
}
// Input:  [3, 1, 4, 1, 5, 9]
// Output: [4, 4, 5, 5, 9, -1]
```

O(n) — each element is pushed and popped at most once.
