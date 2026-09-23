package exercise

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

func ReadRecords(r io.Reader) (map[string]int, error) {
	result := map[string]int{}
	scan := bufio.NewScanner(r)
	line := 0
	for scan.Scan() {
		line++
		text := strings.TrimSpace(scan.Text())
		if text == "" {
			continue
		}
		var record struct {
			Service string `json:"service"`
		}
		if err := json.Unmarshal([]byte(text), &record); err != nil {
			return nil, fmt.Errorf("line %d: %w", line, err)
		}
		if record.Service == "" {
			return nil, fmt.Errorf("line %d: empty service", line)
		}
		result[record.Service]++
	}
	if err := scan.Err(); err != nil {
		return nil, fmt.Errorf("read records near line %d: %w", line+1, err)
	}
	return result, nil
}
