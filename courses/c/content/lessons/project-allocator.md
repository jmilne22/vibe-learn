## Project 4: Memory Allocator

### What You'll Build

A custom implementation of malloc() and free() using sbrk or mmap, with support for splitting and coalescing free blocks. Inspired by CMU's famous malloc lab.

### Concepts Applied

- Low-level memory management
- Pointer arithmetic at the byte level
- Data structure design (free lists)
- Bitwise operations for block headers
- Systems programming (sbrk/mmap)
- Performance optimization
- Debugging memory-level code

### Design

```
Block layout:
+--------+----------------------------+
| Header |        Payload             |
| (size, |    (returned to user)      |
|  alloc)|                            |
+--------+----------------------------+

Free list (implicit or explicit):
[HDR|...free...][HDR|..alloc..][HDR|...free...][HDR|..alloc..]
```

---

*Content coming soon.* This capstone project will guide you through implementing a memory allocator from scratch — the ultimate test of your understanding of C, pointers, and systems programming. You'll start with a simple implicit free list and work toward an optimized explicit free list with coalescing.
