## Test the behavior at the HTTP boundary

A client consumes an HTTP service. A handler defines one. The central contract is:

```go
func(w http.ResponseWriter, r *http.Request)
```

The request contains the method, path, headers, body, and context. The response writer receives headers, a status, and bytes. If you write bytes before calling WriteHeader, the default status is 200. Setting a failure status afterward is too late.

For a readiness endpoint, start by listing cases:

| Request | Current readiness | Status | Body |
|---|---|---|---|
| GET | true | 200 | `ready\n` |
| GET | false | 503 | `not ready\n` |
| POST | either | 405 | No body required |

The 405 response also sets `Allow: GET`. It should not evaluate readiness at all.

**Exercise: Expose readiness over HTTP.** The supplied callback is deliberately small. It lets you test the handler's decision without running a database or cluster. Readiness changes over time, so call it for each supported request.

### Test a handler without opening a socket

```go
recorder := httptest.NewRecorder()
request := httptest.NewRequest("GET", "/ready", nil)
handler.ServeHTTP(recorder, request)
```

Now inspect `recorder.Code`, `recorder.Body.String()`, and response headers. This test covers handler behavior. It does not prove DNS, TLS, routing, or the real server's timeout configuration. Use NewServer when you need an actual client/server exchange; use Recorder when the handler contract is the question.

### Introduce failure deliberately

Take a passing readiness test and temporarily change the implementation to always return 200. The false-readiness case should fail. Then restore it. A test that still passes never checked the behavior you thought it checked.

When writing your own tests, ask which wrong implementation would pass them. If your only HTTP test checks that the function returns nil error, an implementation that ignores every status code may look correct.

### What belongs in a readiness decision?

A service might be alive but unable to accept a request because it has not loaded configuration. Readiness can express that. Restarting it repeatedly will not necessarily help.

A failed downstream dependency raises another question: can this instance still serve any useful traffic? Removing every instance from service because one shared backend is briefly unavailable can make a partial outage total. The right answer depends on request handling and fallback behavior, not on naming the endpoint `/health`.

We will observe readiness and liveness separately in the Kubernetes lab. The Go handler exercise proves the response contract, not that a particular production probe policy is wise.

### A small test plan to carry forward

For each boundary, test success, a meaningful failure, and cleanup. For a parser that means valid input, bad input, and reader failure. For a client it means a received response, a transport failure, and closing the body. For a handler it means method/status/body behavior. You do not need a mock of every internal helper.

Reference: [httptest.ResponseRecorder](https://pkg.go.dev/net/http/httptest#ResponseRecorder).
