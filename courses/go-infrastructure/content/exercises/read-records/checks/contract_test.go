package exercise

import (
	"errors"
	"strings"
	"testing"
)

type brokenReader struct{}

func (brokenReader) Read([]byte) (int, error) { return 0, errors.New("disk unavailable") }
func TestContract(t *testing.T) {
	got, err := ReadRecords(strings.NewReader(`{"service":"api"}

{"service":"api","extra":1}
{"service":"db"}`))
	if err != nil || got["api"] != 2 || got["db"] != 1 {
		t.Fatalf("counts %v,%v", got, err)
	}
	for _, s := range []string{"\n{}", "\nnot-json"} {
		got, err := ReadRecords(strings.NewReader(s))
		if got != nil || err == nil || !strings.Contains(err.Error(), "line 2") {
			t.Errorf("want line 2 error, got %v %v", got, err)
		}
	}
	if _, err := ReadRecords(brokenReader{}); err == nil {
		t.Fatal("read failure ignored")
	}
	if _, err := ReadRecords(strings.NewReader(strings.Repeat("x", 70000))); err == nil {
		t.Fatal("oversize line ignored")
	}
}
