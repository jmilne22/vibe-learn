## Project 3: Stateful App with Persistence

### What You'll Build

Deploy PostgreSQL as a stateful application with persistent storage, configuration management, and proper secret handling. The data survives Pod restarts and rescheduling.

### What You'll Do

1. Create a Secret for the Postgres password
2. Create a ConfigMap for postgres.conf settings
3. Create a PersistentVolumeClaim for the database files
4. Deploy Postgres as a StatefulSet with the PVC, Secret, and ConfigMap mounted
5. Create a headless Service for the StatefulSet
6. Connect with `kubectl exec` and create a table, insert data
7. Delete the Pod, wait for it to restart, verify data persists
8. Scale to 2 replicas, observe stable network identities (postgres-0, postgres-1)

### Concepts Applied

- StatefulSets and stable Pod identity
- PersistentVolumeClaims and StorageClasses
- ConfigMaps as volume mounts
- Secrets for credentials
- Headless Services for StatefulSets

---

*Content coming soon.* This project teaches you to run stateful workloads on Kubernetes — the pattern used for databases, message queues, and any application that needs persistent data.
