## Project 2: Expose a Guestbook App

### What You'll Build

Deploy the classic Kubernetes guestbook app — a multi-tier web application with a PHP frontend and Redis backend. You'll wire up Services, DNS discovery, and Ingress routing.

### What You'll Do

1. Deploy a Redis leader (single Pod) with a ClusterIP Service
2. Deploy Redis followers that replicate from the leader
3. Deploy the PHP frontend that connects to Redis via DNS (`redis-leader.default.svc.cluster.local`)
4. Expose the frontend with a NodePort Service, verify in browser
5. Install an Ingress controller (nginx-ingress)
6. Create an Ingress resource to route `guestbook.local` to the frontend
7. Test path-based routing: `/api` to a backend, `/` to frontend

### Concepts Applied

- Multi-tier application deployment
- ClusterIP and NodePort Services
- DNS-based service discovery
- Ingress controller setup and Ingress resources
- Labels and selectors for Service routing

---

*Content coming soon.* This project builds a real multi-service application and exposes it to the outside world. You'll see how Services and DNS tie everything together.
