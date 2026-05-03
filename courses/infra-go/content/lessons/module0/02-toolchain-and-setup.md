## Toolchain & Setup

Install Go, lay out a project, and wire your editor. Quick reference for everything in the toolchain you'll touch in this course.

### Go Toolchain

Install from [go.dev/dl](https://go.dev/dl/) or your package manager. Verify:

```bash
go version    # go1.22+ recommended
which go      # should be in $PATH
```

On Void Linux:

```bash
sudo xbps-install -S go
```

### Module System

```bash
go mod init github.com/you/project   # create go.mod (do this first in every project)
go mod tidy                           # add missing deps, remove unused ones
go get github.com/spf13/cobra@latest  # add a dependency
```

`go.mod` tracks dependencies. `go.sum` locks checksums. Both get committed to git.

### Project Layout

```
myproject/
├── go.mod              # module definition + dependencies
├── go.sum              # dependency checksums (auto-generated)
├── main.go             # entry point (small projects)
├── cmd/                # entry points (multi-binary projects)
│   └── myapp/
│       └── main.go
├── internal/           # private packages — can't be imported by other modules
│   ├── config/
│   └── server/
├── pkg/                # public packages — can be imported (optional, some projects skip this)
└── Makefile            # build/test/lint shortcuts
```

**Rules of thumb:**
- Start flat (everything in `main.go`) until it gets painful
- Move code to `internal/` when you have multiple packages that shouldn't be imported externally
- Only use `pkg/` when you intentionally want other projects to import your library code
- One `main.go` per binary, under `cmd/` if you have multiple

### Editor Setup

#### Helix

Helix has built-in LSP support. Just install `gopls`:

```bash
go install golang.org/x/tools/gopls@latest
```

Helix auto-detects `gopls` for `.go` files. Verify in `~/.config/helix/languages.toml`:

```toml
[[language]]
name = "go"
auto-format = true
formatter = { command = "goimports", args = ["-local", "github.com/you"] }
```

Install `goimports` for auto-organizing imports:

```bash
go install golang.org/x/tools/cmd/goimports@latest
```

#### Neovim

If using `nvim-lspconfig`:

```lua
require('lspconfig').gopls.setup{}
```

For format-on-save, add to your config:

```lua
vim.api.nvim_create_autocmd("BufWritePre", {
    pattern = "*.go",
    callback = function()
        vim.lsp.buf.format({ async = false })
    end,
})
```

#### VS Code

Install the official **Go** extension by the Go team. It handles `gopls`, formatting, testing, and debugging out of the box.

---
