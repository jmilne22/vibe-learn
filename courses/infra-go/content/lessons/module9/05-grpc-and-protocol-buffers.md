## gRPC & Protocol Buffers

### Why gRPC?

| Feature | REST/JSON | gRPC/Protobuf |
|---|---|---|
| Encoding | Text (JSON) | Binary (protobuf) |
| Schema | OpenAPI (optional) | .proto (required) |
| Code gen | Optional | Built-in |
| Streaming | Websockets/SSE | Native bidirectional |
| Performance | Good | Great (2-10x smaller, faster) |

gRPC is the standard for internal service communication in K8s, Envoy, Istio, and most CNCF projects.

### Defining a Service (.proto)

```protobuf
syntax = "proto3";
package infra;

option go_package = "github.com/example/infra/pb";

message Pod {
  string name = 1;
  string namespace = 2;
  string status = 3;
  int32 replicas = 4;
}

message ListPodsRequest {
  string namespace = 1;
}

message ListPodsResponse {
  repeated Pod pods = 1;
}

service PodService {
  rpc ListPods(ListPodsRequest) returns (ListPodsResponse);
  rpc WatchPods(ListPodsRequest) returns (stream Pod);  // server-side streaming
}
```

### Generating Go Code

```bash
# Install: go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
#          go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
protoc --go_out=. --go-grpc_out=. pod.proto
```

This generates `pod.pb.go` (message types) and `pod_grpc.pb.go` (service interface).

### Implementing the Server

```go
type podServer struct {
    pb.UnimplementedPodServiceServer
    pods []pb.Pod
}

func (s *podServer) ListPods(ctx context.Context, req *pb.ListPodsRequest) (*pb.ListPodsResponse, error) {
    var filtered []*pb.Pod
    for i := range s.pods {
        if req.Namespace == "" || s.pods[i].Namespace == req.Namespace {
            filtered = append(filtered, &s.pods[i])
        }
    }
    return &pb.ListPodsResponse{Pods: filtered}, nil
}

// Server-side streaming
func (s *podServer) WatchPods(req *pb.ListPodsRequest, stream pb.PodService_WatchPodsServer) error {
    for i := range s.pods {
        if req.Namespace == "" || s.pods[i].Namespace == req.Namespace {
            if err := stream.Send(&s.pods[i]); err != nil {
                return err
            }
        }
    }
    return nil
}

func main() {
    lis, _ := net.Listen("tcp", ":50051")
    grpcServer := grpc.NewServer()
    pb.RegisterPodServiceServer(grpcServer, &podServer{})
    grpcServer.Serve(lis)
}
```

### Building the Client

```go
conn, err := grpc.Dial("localhost:50051", grpc.WithTransportCredentials(insecure.NewCredentials()))
if err != nil {
    log.Fatal(err)
}
defer conn.Close()

client := pb.NewPodServiceClient(conn)

// Unary call
resp, err := client.ListPods(context.Background(), &pb.ListPodsRequest{Namespace: "production"})
if err != nil {
    log.Fatal(err)
}
for _, pod := range resp.Pods {
    fmt.Printf("%s/%s: %s\n", pod.Namespace, pod.Name, pod.Status)
}

// Server-side streaming
stream, err := client.WatchPods(context.Background(), &pb.ListPodsRequest{})
if err != nil {
    log.Fatal(err)
}
for {
    pod, err := stream.Recv()
    if err == io.EOF {
        break
    }
    if err != nil {
        log.Fatal(err)
    }
    fmt.Printf("got pod: %s\n", pod.Name)
}
```

### gRPC Streaming Patterns

```
Unary:         Client ---request--> Server ---response--> Client
Server stream: Client ---request--> Server ---stream of responses--> Client
Client stream: Client ---stream of requests--> Server ---response--> Client
Bidirectional: Client <---stream--> Server
```

**Real uses:**
- **Server streaming:** Watch for resource changes (like `kubectl get pods -w`)
- **Client streaming:** Upload logs, send batched metrics
- **Bidirectional:** Chat, real-time sync, terminal sessions

---
