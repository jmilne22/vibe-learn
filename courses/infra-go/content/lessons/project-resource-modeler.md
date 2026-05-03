## Project Goals

Build a small infrastructure resource model using Go structs, constructors, methods, and interfaces.

This project upgrades the loose maps and parallel slices from Module 1 into typed values that are easier to validate, sort, print, and pass between functions.

Your program should:

1. Define reusable resource structs
2. Add constructors that validate input and apply defaults
3. Add methods for formatting and validation
4. Use a small interface to validate different resource types
5. Produce a deterministic report from typed data

## Resource Types

Start with these types:

```go
type Metadata struct {
    Name      string
    Namespace string
    Labels    map[string]string
}

type Resources struct {
    MemoryMB int
    CPUM     int
}

type Pod struct {
    Metadata
    Status    string
    Resources Resources
}

type Service struct {
    Metadata
    Port     int
    Target   int
    Selector map[string]string
}
```

## Requirements

### Constructors

Write these constructors:

```go
func NewPod(name, namespace string, memoryMB, cpuM int) (Pod, error)
func NewService(name, namespace string, port, target int) (Service, error)
```

Rules:

- Name must not be empty.
- Namespace defaults to `default` when empty.
- Memory and CPU must not be negative.
- Ports must be between 1 and 65535.
- A new pod starts with status `Pending`.
- A new service gets an empty selector map.

### Methods

Add these methods:

```go
func (m Metadata) FullName() string
func (p Pod) String() string
func (s Service) String() string
func (p Pod) Validate() error
func (s Service) Validate() error
func (p *Pod) SetStatus(status string)
func (s *Service) AddSelector(key, value string)
```

Use value receivers for read-only methods and pointer receivers for mutating methods.

### Interface

Define and use this small interface:

```go
type Validator interface {
    Validate() error
}
```

Write:

```go
func ValidateAll(items []Validator) []error
```

It should call `Validate` on each item and return all validation errors.

## Expected Output

Create a few pods and services, then print a report like this:

```txt
Resources:
Pod default/checkout-api Pending 512MB 250m
Pod prod/ledger-worker Running 1024MB 500m
Service default/checkout port=8080 target=8080

Validation:
all resources valid
```

## Acceptance Criteria

- Constructors return zero values plus errors for invalid input.
- Empty namespaces become `default`.
- Mutating methods use pointer receivers.
- `ValidateAll` accepts both pods and services through the `Validator` interface.
- `String` methods make printed output readable.
- The program uses named struct fields in literals.

## Hints

> **Embedding:** Put `Metadata` inside `Pod` and `Service` so `FullName()` is promoted.

> **Receiver choice:** If a method changes the struct or initializes a map field, use a pointer receiver.

> **Interface design:** `Validator` needs one method. Keep it small and behavior-focused.

## Stretch Goals

- Sort pods by memory descending before printing.
- Group pods by namespace.
- Add a `Resource` interface with `FullName() string`.
- Add a report that prints only invalid resources.

## Module 3 Teaser

This project returns errors, but it does not test them deeply yet. Module 3 turns these constructors and validators into tested code with wrapped errors, sentinel errors, and table-driven tests.
