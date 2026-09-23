package exercise

import (
	"reflect"
	"strings"
	"testing"
)

func TestContract(t *testing.T) {
	c, err := ReadConfig(strings.NewReader(`{"targets":["https://example.com/health"],"workers":2}  `))
	if err != nil || c.Workers != 2 || len(c.Targets) != 1 {
		t.Fatalf("valid config: %v %v", c, err)
	}
	for _, s := range []string{"", `{`, `null`, `{}`, `{"targets":["http://x"],"workers":0}`, `{"targets":["http://x"],"workers":17}`, `{"targets":["ftp://x"],"workers":1}`, `{"targets":["http://u:p@x"],"workers":1}`, `{"targets":["relative"],"workers":1}`, `{"targets":["http://x"],"workers":1,"typo":1}`, `{"targets":["http://x"],"workers":1} {}`} {
		got, err := ReadConfig(strings.NewReader(s))
		if err == nil || !reflect.DeepEqual(got, Config{}) {
			t.Errorf("ReadConfig(%q)=%v,%v; want zero config and error", s, got, err)
		}
	}
}
