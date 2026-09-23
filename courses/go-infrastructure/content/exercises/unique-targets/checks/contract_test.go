package exercise

import (
	"slices"
	"testing"
)

func TestContract(t *testing.T) {
	in := []string{"api", "worker", "api", "API"}
	got := UniqueTargets(in)
	if !slices.Equal(got, []string{"api", "worker", "API"}) {
		t.Fatalf("got %v", got)
	}
	got[0] = "changed"
	if in[0] != "api" {
		t.Fatal("result aliases input")
	}
	if len(UniqueTargets(nil)) != 0 {
		t.Fatal("empty input should have no targets")
	}
}
