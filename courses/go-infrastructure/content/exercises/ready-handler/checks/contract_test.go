package exercise

import (
	"net/http/httptest"
	"testing"
)

func TestContract(t *testing.T) {
	state := false
	calls := 0
	h := ReadyHandler(func() bool { calls++; return state })
	for _, tc := range []struct {
		ready bool
		code  int
		body  string
	}{{false, 503, "not ready\n"}, {true, 200, "ready\n"}} {
		state = tc.ready
		r := httptest.NewRecorder()
		h.ServeHTTP(r, httptest.NewRequest("GET", "/ready", nil))
		if r.Code != tc.code || r.Body.String() != tc.body {
			t.Fatalf("got %d %q", r.Code, r.Body.String())
		}
	}
	before := calls
	r := httptest.NewRecorder()
	h.ServeHTTP(r, httptest.NewRequest("POST", "/ready", nil))
	if r.Code != 405 || r.Header().Get("Allow") != "GET" || calls != before {
		t.Fatal("method contract failed")
	}
}
