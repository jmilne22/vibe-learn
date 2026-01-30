## Project Goals

Build an interactive file browser:

1. Navigate directories with arrow keys
2. Enter to go into directory / open file info
3. Backspace to go up a directory
4. Show file sizes and permissions
5. Syntax highlighting for different file types

## Components to Use

- `bubbles/list` — for the file list
- `lipgloss` — for styling
- `os.ReadDir` — for directory contents

## Suggested Structure

*Model structure*

```go
type model struct {
    currentDir  string
    files       []os.DirEntry
    cursor      int
    selected    string
    err         error
}

func (m model) Init() tea.Cmd {
    return loadDir(m.currentDir)
}

func loadDir(path string) tea.Cmd {
    return func() tea.Msg {
        entries, err := os.ReadDir(path)
        if err != nil {
            return errMsg{err}
        }
        return dirLoadedMsg{entries}
    }
}
```

> **Skills Used:** <p>Bubble Tea architecture, lipgloss styling, file system operations, keyboard handling.</p>
