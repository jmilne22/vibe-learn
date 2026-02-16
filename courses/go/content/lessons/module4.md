## Interfaces Are Implicit

In Python you'd use duck typing or ABC. In Go, interfaces are **implicit** — no "implements" keyword.

*Implicit implementation*

```go
// Define an interface
type Speaker interface {
    Speak() string
}

// Any type with Speak() method implements Speaker
type Dog struct{ Name string }
func (d Dog) Speak() string { return "Woof!" }

type Cat struct{ Name string }
func (c Cat) Speak() string { return "Meow!" }

// Both work as Speaker — no declaration needed!
func MakeSound(s Speaker) {
    fmt.Println(s.Speak())
}

MakeSound(Dog{"Rex"})  // Woof!
MakeSound(Cat{"Whiskers"})  // Meow!
```

> **The Magic:** Dog and Cat never mention Speaker. They just have the right method. Go figures it out.

## Common Standard Library Interfaces

*Interfaces you'll use constantly*

```go
// io.Reader — anything you can read from
type Reader interface {
    Read(p []byte) (n int, err error)
}

// io.Writer — anything you can write to
type Writer interface {
    Write(p []byte) (n int, err error)
}

// fmt.Stringer — custom string representation
type Stringer interface {
    String() string
}

// error — yes, it's just an interface!
type error interface {
    Error() string
}
```

## The Empty Interface: any

The empty interface `interface{}` (or `any` in Go 1.18+) matches everything.

*Empty interface*

```go
// Accepts anything
func PrintAnything(v any) {
    fmt.Println(v)
}

PrintAnything(42)
PrintAnything("hello")
PrintAnything([]int{1, 2, 3})

// Map with any values
data := map[string]any{
    "name": "Alice",
    "age":  30,
    "active": true,
}
```

> **Use Sparingly:** `any` loses type safety. Prefer specific interfaces when possible.

## Type Assertions & Type Switches

*Type assertion*

```go
var i any = "hello"

// Type assertion (may panic!)
s := i.(string)
fmt.Println(s)  // "hello"

// Safe type assertion with ok
s, ok := i.(string)
if ok {
    fmt.Println("It's a string:", s)
}

// Type switch — handle multiple types
func describe(i any) {
    switch v := i.(type) {
    case int:
        fmt.Printf("Integer: %d\n", v)
    case string:
        fmt.Printf("String: %s\n", v)
    case bool:
        fmt.Printf("Boolean: %t\n", v)
    default:
        fmt.Printf("Unknown type\n")
    }
}
```

## Interface Design Principles

### Keep Interfaces Small

*Small interfaces*

```go
// ✓ Good — small, focused
type Reader interface {
    Read(p []byte) (n int, err error)
}

// ✓ Compose when needed
type ReadWriter interface {
    Reader
    Writer
}

// ❌ Avoid — too big, hard to implement
type DoEverything interface {
    Read() error
    Write() error
    Close() error
    Flush() error
    // ... 10 more methods
}
```

### Accept Interfaces, Return Structs

*Interface guidelines*

```go
// ✓ Accept interface — flexible
func Process(r io.Reader) error {
    // Works with files, network, strings, etc.
}

// ✓ Return concrete type — clear
func NewServer() *Server {
    return &Server{}
}
```

## Exercises

Progress through each section in order, or jump to where you need practice.

Practice individual concepts you just learned.

<div id="warmups-container">
            <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
            </div>

### Challenges

Combine concepts and learn patterns. Each challenge has multiple variants at different difficulties.

<div id="challenges-container">
            <noscript><p class="js-required">JavaScript is required for the interactive exercises.</p></noscript>
            </div>

## Module 4 Summary

- **Implicit implementation** — no "implements" keyword
- **Small interfaces** — 1-3 methods ideal
- **any/interface{}** — matches everything, use sparingly
- **Type assertions** — extract concrete type from interface
- **Type switches** — handle multiple types elegantly
- **Accept interfaces, return structs**
