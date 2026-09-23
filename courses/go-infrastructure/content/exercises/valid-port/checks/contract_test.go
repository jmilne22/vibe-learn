package exercise

import "testing"

func TestContract(t *testing.T) {
	for _, tc := range []struct {
		port int
		want bool
	}{{-1, false}, {0, false}, {1, true}, {443, true}, {65535, true}, {65536, false}} {
		if got := ValidPort(tc.port); got != tc.want {
			t.Errorf("ValidPort(%d)=%v; want %v", tc.port, got, tc.want)
		}
	}
}
