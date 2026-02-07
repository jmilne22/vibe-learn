## What is Bubble Tea?

Bubble Tea is a TUI framework based on The Elm Architecture: **Model → Update → View**

*Install*

```bash
go get github.com/charmbracelet/bubbletea
go get github.com/charmbracelet/lipgloss  # Styling
go get github.com/charmbracelet/bubbles   # Pre-built components
```

<div class="tui-demo">
<span style="color: var(--green-bright)">? Select a task:</span>
<br><span style="color: var(--purple)">❯</span> <span style="color: var(--text-main)">build</span> <span style="color: var(--text-dim)">- Build the application</span>
<br>  <span style="color: var(--text-dim)">test - Run all tests</span>
<br>  <span style="color: var(--text-dim)">deploy - Deploy to production</span>
<br>  <span style="color: var(--text-dim)">clean - Remove build artifacts</span>
<br><br><span style="color: var(--text-dim)">↑/↓: navigate • enter: select • q: quit</span>
            </div>

## The Elm Architecture

*Basic structure*

```go
package main

import (
    "fmt"
    tea "github.com/charmbracelet/bubbletea"
)

// MODEL: Your application state
type model struct {
    choices  []string
    cursor   int
    selected map[int]struct{}
}

// INIT: Initial state and optional command
func initialModel() model {
    return model{
        choices:  []string{"Buy milk", "Walk dog", "Write code"},
        selected: make(map[int]struct{}),
    }
}

func (m model) Init() tea.Cmd {
    return nil  // No initial command
}

// UPDATE: Handle messages (key presses, etc)
func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
    switch msg := msg.(type) {
    case tea.KeyMsg:
        switch msg.String() {
        case "q", "ctrl+c":
            return m, tea.Quit
        case "up", "k":
            if m.cursor > 0 {
                m.cursor--
            }
        case "down", "j":
            if m.cursor < len(m.choices)-1 {
                m.cursor++
            }
        case "enter", " ":
            if _, ok := m.selected[m.cursor]; ok {
                delete(m.selected, m.cursor)
            } else {
                m.selected[m.cursor] = struct{}{}
            }
        }
    }
    return m, nil
}

// VIEW: Render the UI as a string
func (m model) View() string {
    s := "What do you want to do?\n\n"
    
    for i, choice := range m.choices {
        cursor := " "
        if m.cursor == i {
            cursor = ">"
        }
        
        checked := " "
        if _, ok := m.selected[i]; ok {
            checked = "x"
        }
        
        s += fmt.Sprintf("%s [%s] %s\n", cursor, checked, choice)
    }
    
    s += "\nPress q to quit.\n"
    return s
}

func main() {
    p := tea.NewProgram(initialModel())
    if _, err := p.Run(); err != nil {
        fmt.Println("Error:", err)
    }
}
```

## Styling with Lipgloss

*Using lipgloss*

```go
import "github.com/charmbracelet/lipgloss"

// Define styles
var (
    titleStyle = lipgloss.NewStyle().
        Bold(true).
        Foreground(lipgloss.Color("#00ff9d")).
        MarginBottom(1)
    
    selectedStyle = lipgloss.NewStyle().
        Foreground(lipgloss.Color("#9d00ff")).
        Bold(true)
    
    normalStyle = lipgloss.NewStyle().
        Foreground(lipgloss.Color("#888888"))
    
    boxStyle = lipgloss.NewStyle().
        Border(lipgloss.RoundedBorder()).
        BorderForeground(lipgloss.Color("#00ff9d")).
        Padding(1, 2)
)

func (m model) View() string {
    title := titleStyle.Render("Select Tasks")
    
    var items string
    for i, choice := range m.choices {
        if m.cursor == i {
            items += selectedStyle.Render("❯ "+choice) + "\n"
        } else {
            items += normalStyle.Render("  "+choice) + "\n"
        }
    }
    
    return boxStyle.Render(title + items)
}
```

## Using Pre-built Components (Bubbles)

*Text input component*

```go
import (
    "github.com/charmbracelet/bubbles/textinput"
    tea "github.com/charmbracelet/bubbletea"
)

type model struct {
    textInput textinput.Model
    err       error
}

func initialModel() model {
    ti := textinput.New()
    ti.Placeholder = "Enter your name"
    ti.Focus()
    ti.CharLimit = 50
    ti.Width = 30
    
    return model{textInput: ti}
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
    var cmd tea.Cmd
    
    switch msg := msg.(type) {
    case tea.KeyMsg:
        switch msg.Type {
        case tea.KeyEnter:
            return m, tea.Quit
        case tea.KeyCtrlC:
            return m, tea.Quit
        }
    }
    
    m.textInput, cmd = m.textInput.Update(msg)
    return m, cmd
}

func (m model) View() string {
    return fmt.Sprintf(
        "What's your name?\n\n%s\n\n%s",
        m.textInput.View(),
        "(press enter to submit)",
    )
}
```

### 🔨 Project: File Browser TUI

Put your skills to work! Build an interactive terminal file browser with Bubble Tea.

Start Project →

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

## Module 8 Summary

- **Bubble Tea** = Elm Architecture for terminals
- **Model** = your state
- **Update** = handle messages/events
- **View** = render state as string
- **Lipgloss** = CSS-like styling
- **Bubbles** = pre-built components
