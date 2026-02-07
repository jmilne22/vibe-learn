## The Functional Options Pattern

The most "Go" pattern. Flexible configuration without breaking APIs.

*Functional options*

```go
type Server struct {
    host    string
    port    int
    timeout time.Duration
    maxConn int
}

// Option is a function that configures Server
type Option func(*Server)

// Option functions
func WithPort(port int) Option {
    return func(s *Server) {
        s.port = port
    }
}

func WithTimeout(d time.Duration) Option {
    return func(s *Server) {
        s.timeout = d
    }
}

func WithMaxConnections(n int) Option {
    return func(s *Server) {
        s.maxConn = n
    }
}

// Constructor with variadic options
func NewServer(host string, opts ...Option) *Server {
    s := &Server{
        host:    host,
        port:    8080,          // defaults
        timeout: 30 * time.Second,
        maxConn: 100,
    }
    
    for _, opt := range opts {
        opt(s)
    }
    
    return s
}

// Usage — clean and extensible!
server := NewServer("localhost")
server := NewServer("localhost", WithPort(9000))
server := NewServer("localhost",
    WithPort(9000),
    WithTimeout(60*time.Second),
    WithMaxConnections(500),
)
```

> **Why This Rules:** Add new options without breaking existing code. Clear defaults. Self-documenting API.

## Factory Pattern

*Factory functions*

```go
// Interface
type Storage interface {
    Save(key string, data []byte) error
    Load(key string) ([]byte, error)
}

// Implementations
type FileStorage struct { dir string }
type S3Storage struct { bucket string }
type MemoryStorage struct { data map[string][]byte }

// Factory function
func NewStorage(storageType string, config map[string]string) (Storage, error) {
    switch storageType {
    case "file":
        return &FileStorage{dir: config["dir"]}, nil
    case "s3":
        return &S3Storage{bucket: config["bucket"]}, nil
    case "memory":
        return &MemoryStorage{data: make(map[string][]byte)}, nil
    default:
        return nil, fmt.Errorf("unknown storage type: %s", storageType)
    }
}

// Usage
storage, err := NewStorage("s3", map[string]string{"bucket": "my-bucket"})
```

## Strategy Pattern

Swap algorithms at runtime using interfaces.

*Strategy pattern*

```go
// Strategy interface
type Compressor interface {
    Compress(data []byte) ([]byte, error)
    Decompress(data []byte) ([]byte, error)
}

// Strategies
type GzipCompressor struct{}
type ZstdCompressor struct{}
type NoCompressor struct{}

// Context that uses strategy
type FileProcessor struct {
    compressor Compressor
}

func (p *FileProcessor) SaveFile(path string, data []byte) error {
    compressed, err := p.compressor.Compress(data)
    if err != nil {
        return err
    }
    return os.WriteFile(path, compressed, 0644)
}

// Swap strategy at runtime
processor := &FileProcessor{compressor: &GzipCompressor{}}
processor.compressor = &ZstdCompressor{}  // Change strategy
```

## Builder Pattern

*Builder pattern*

```go
type Query struct {
    table   string
    columns []string
    where   []string
    orderBy string
    limit   int
}

type QueryBuilder struct {
    query Query
}

func NewQueryBuilder(table string) *QueryBuilder {
    return &QueryBuilder{query: Query{table: table}}
}

func (b *QueryBuilder) Select(cols ...string) *QueryBuilder {
    b.query.columns = cols
    return b
}

func (b *QueryBuilder) Where(condition string) *QueryBuilder {
    b.query.where = append(b.query.where, condition)
    return b
}

func (b *QueryBuilder) OrderBy(col string) *QueryBuilder {
    b.query.orderBy = col
    return b
}

func (b *QueryBuilder) Limit(n int) *QueryBuilder {
    b.query.limit = n
    return b
}

func (b *QueryBuilder) Build() string {
    // Build SQL string from query struct
    return "..."
}

// Usage — fluent API
sql := NewQueryBuilder("users").
    Select("id", "name", "email").
    Where("active = true").
    Where("age > 18").
    OrderBy("created_at DESC").
    Limit(10).
    Build()
```

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

## Module 10 Summary

- **Functional Options** — flexible config with defaults
- **Factory** — create objects without specifying concrete types
- **Strategy** — swap algorithms via interfaces
- **Builder** — fluent API for complex object construction
