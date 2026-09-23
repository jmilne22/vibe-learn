package exercise

import (
	"reflect"
	"testing"
)

func TestContract(t *testing.T) {
	for _, tc := range []struct {
		in   []int
		want map[string]int
	}{
		{nil, map[string]int{"ok": 0, "client": 0, "server": 0, "other": 0}},
		{[]int{199, 200, 299, 300, 399, 400, 499, 500, 599, 600}, map[string]int{"ok": 2, "client": 2, "server": 2, "other": 4}},
	} {
		before := append([]int(nil), tc.in...)
		got := CountStatuses(tc.in)
		if !reflect.DeepEqual(got, tc.want) {
			t.Errorf("got %v; want %v", got, tc.want)
		}
		if !reflect.DeepEqual(before, tc.in) {
			t.Fatal("input changed")
		}
	}
}
