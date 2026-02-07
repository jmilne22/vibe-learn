## Trees

Recursive structures. Most tree problems have elegant recursive solutions.

*Node definition*

```go
type TreeNode struct {
    Val   int
    Left  *TreeNode
    Right *TreeNode
}
```

*Pattern: tree traversals*

```go
// Inorder: Left → Node → Right (gives sorted order for BSTs)
func inorder(root *TreeNode) []int {
    if root == nil {
        return nil
    }
    var result []int
    result = append(result, inorder(root.Left)...)
    result = append(result, root.Val)
    result = append(result, inorder(root.Right)...)
    return result
}

// Preorder: Node → Left → Right (useful for copying/serializing)
func preorder(root *TreeNode) []int {
    if root == nil {
        return nil
    }
    result := []int{root.Val}
    result = append(result, preorder(root.Left)...)
    result = append(result, preorder(root.Right)...)
    return result
}

// Max depth (classic recursive pattern)
func maxDepth(root *TreeNode) int {
    if root == nil {
        return 0
    }
    left := maxDepth(root.Left)
    right := maxDepth(root.Right)
    if left > right {
        return left + 1
    }
    return right + 1
}
```

> **When to use:** Hierarchical data, BST operations, path problems. The base case is almost always `if root == nil`. Think recursively: solve for left subtree, solve for right subtree, combine.

## Graphs & BFS

Graphs are nodes connected by edges. BFS explores level by level using a queue.

*Pattern: BFS with a queue*

```go
// BFS traversal of an adjacency list graph
func bfs(graph map[int][]int, start int) []int {
    visited := make(map[int]bool)
    queue := []int{start}
    visited[start] = true
    var order []int

    for len(queue) > 0 {
        node := queue[0]
        queue = queue[1:]
        order = append(order, node)

        for _, neighbor := range graph[node] {
            if !visited[neighbor] {
                visited[neighbor] = true
                queue = append(queue, neighbor)
            }
        }
    }
    return order
}
```

*Pattern: DFS with recursion*

```go
func dfs(graph map[int][]int, node int, visited map[int]bool) {
    visited[node] = true
    for _, neighbor := range graph[node] {
        if !visited[neighbor] {
            dfs(graph, neighbor, visited)
        }
    }
}
```

> **When to use:** Shortest path (BFS), connected components, cycle detection in graphs, flood fill. BFS finds shortest unweighted paths; DFS explores full branches.

## Sorting Algorithms

Understanding how sorting works under the hood.

*Merge Sort — O(n log n), stable*

```go
func mergeSort(nums []int) []int {
    if len(nums) <= 1 {
        return nums
    }
    mid := len(nums) / 2
    left := mergeSort(nums[:mid])
    right := mergeSort(nums[mid:])
    return merge(left, right)
}

func merge(left, right []int) []int {
    result := make([]int, 0, len(left)+len(right))
    i, j := 0, 0
    for i < len(left) && j < len(right) {
        if left[i] <= right[j] {
            result = append(result, left[i])
            i++
        } else {
            result = append(result, right[j])
            j++
        }
    }
    result = append(result, left[i:]...)
    result = append(result, right[j:]...)
    return result
}
```

> **Key insight:** Go's `sort.Slice` uses a hybrid algorithm (introsort). You won't rewrite sorting in production — but understanding merge sort teaches divide-and-conquer, and it's a common interview question.

## Heaps & Priority Queues

A heap gives you the min (or max) element in O(log n). Go provides `container/heap`.

*Using container/heap*

```go
import "container/heap"

// IntHeap implements heap.Interface for a min-heap of ints
type IntHeap []int

func (h IntHeap) Len() int           { return len(h) }
func (h IntHeap) Less(i, j int) bool { return h[i] < h[j] }
func (h IntHeap) Swap(i, j int)      { h[i], h[j] = h[j], h[i] }

func (h *IntHeap) Push(x interface{}) {
    *h = append(*h, x.(int))
}

func (h *IntHeap) Pop() interface{} {
    old := *h
    n := len(old)
    x := old[n-1]
    *h = old[:n-1]
    return x
}

// Usage
func kthSmallest(nums []int, k int) int {
    h := &IntHeap{}
    heap.Init(h)
    for _, n := range nums {
        heap.Push(h, n)
    }
    var result int
    for i := 0; i < k; i++ {
        result = heap.Pop(h).(int)
    }
    return result
}
```

> **When to use:** "K-th largest/smallest", "top K elements", "merge K sorted lists", scheduling problems. The signal is needing repeated access to the extreme element.

## Tries (Prefix Trees)

A tree where each node represents a character. Fast prefix lookups.

*Pattern: basic trie*

```go
type TrieNode struct {
    children map[rune]*TrieNode
    isEnd    bool
}

type Trie struct {
    root *TrieNode
}

func NewTrie() *Trie {
    return &Trie{root: &TrieNode{children: make(map[rune]*TrieNode)}}
}

func (t *Trie) Insert(word string) {
    node := t.root
    for _, ch := range word {
        if _, ok := node.children[ch]; !ok {
            node.children[ch] = &TrieNode{children: make(map[rune]*TrieNode)}
        }
        node = node.children[ch]
    }
    node.isEnd = true
}

func (t *Trie) Search(word string) bool {
    node := t.root
    for _, ch := range word {
        if _, ok := node.children[ch]; !ok {
            return false
        }
        node = node.children[ch]
    }
    return node.isEnd
}

func (t *Trie) StartsWith(prefix string) bool {
    node := t.root
    for _, ch := range prefix {
        if _, ok := node.children[ch]; !ok {
            return false
        }
        node = node.children[ch]
    }
    return true
}
```

> **When to use:** Autocomplete, spell checking, prefix matching, word search problems. The signal is "all words starting with..." or building a dictionary.

## Choosing the Right Pattern

| Problem Signal | Pattern | Example |
|---|---|---|
| "Tree structure" | Recursion/DFS | Max Depth |
| "Shortest path" | BFS | Word Ladder |
| "Top K / Kth element" | Heap | Kth Largest |
| "Prefix matching" | Trie | Autocomplete |

## Exercises

Progress through each section in order, or jump to where you need practice.

Practice individual concepts you just learned.

<div id="warmups-container">
            <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
            </div>

### 💪 Challenges

Combine concepts and learn patterns. Each challenge has multiple variants at different difficulties.

<div id="challenges-container">
            <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
            </div>

## Module 21 Summary

- **Trees** — recursive traversals, depth calculations, BST operations
- **Graphs & BFS** — level-order exploration, shortest paths
- **Sorting** — merge sort and divide-and-conquer
- **Heaps** — priority queues via container/heap
- **Tries** — prefix trees for string operations
