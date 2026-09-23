package exercise

import "net/http"

func ReadyHandler(ready func() bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(501) })
}
