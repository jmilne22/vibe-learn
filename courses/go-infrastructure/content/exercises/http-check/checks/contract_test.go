package exercise

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type transportFunc func(*http.Request) (*http.Response, error)

func (f transportFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

type trackedBody struct {
	io.Reader
	closed bool
}

func (b *trackedBody) Close() error { b.closed = true; return nil }
func TestContract(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			t.Error("not GET")
		}
		w.WriteHeader(503)
	}))
	defer s.Close()
	code, err := Check(context.Background(), s.Client(), s.URL)
	if code != 503 || err != nil {
		t.Fatalf("got %d %v", code, err)
	}
	body := &trackedBody{Reader: strings.NewReader("payload")}
	c := &http.Client{Transport: transportFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 204, Body: body, Header: make(http.Header)}, nil
	})}
	if _, err := Check(context.Background(), c, "http://example.test"); err != nil || !body.closed {
		t.Fatal("response body was not closed")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if code, err := Check(ctx, s.Client(), s.URL); code != 0 || !errors.Is(err, context.Canceled) {
		t.Fatalf("cancellation: %d %v", code, err)
	}
	sentinel := errors.New("offline")
	c.Transport = transportFunc(func(*http.Request) (*http.Response, error) { return nil, sentinel })
	if code, err := Check(context.Background(), c, "http://example.test"); code != 0 || !errors.Is(err, sentinel) {
		t.Fatalf("transport error: %d %v", code, err)
	}
	if _, err := Check(context.Background(), c, "://bad"); err == nil {
		t.Fatal("invalid URL accepted")
	}
}
