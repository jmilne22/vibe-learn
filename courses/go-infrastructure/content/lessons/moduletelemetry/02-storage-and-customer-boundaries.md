## Separate storage choices from deployment boundaries

Logs, traces, and metrics share collection infrastructure, but their useful access patterns differ. A log query may filter many events over a time range. A metric query may aggregate samples across labeled time series. A trace query follows related spans. Calling all of them “observability data” does not make their indexes, retention costs, or query patterns identical.

### Learn the role before the internals

ClickHouse is a column-oriented analytical database. Selecting a few columns and filtering/aggregating many rows is a different workload from repeatedly updating one transactional row. For telemetry, batching, ordering keys, partitions, and retention affect ingestion and query work. A label change is not a magic fix for an unsuitable sort order or too many tiny inserts.

VictoriaMetrics stores and queries metrics/time series. A metric name plus its label set identifies a series. Adding a label whose value is a request ID can turn a bounded set of series into one that grows with traffic. Cardinality affects memory, indexing, ingestion, and queries; it is not merely how many label names appear in a sample.

If 100 services each have 20 instances and every instance emits ten methods' worth of a metric, there can be 20,000 combinations before adding routes, status codes, or tenants. Not every theoretical combination necessarily occurs, but this calculation shows why a label's value space matters.

Groundcover's public material describes a customer-owned data plane and a managed control plane, with ClickHouse and VictoriaMetrics playing different storage roles. Use that as architectural context, not a specification of its private implementation. [Public architecture description](https://www.groundcover.com/guides/securing-customer-owned-telemetry-planes).

### A control plane can be down while data still flows

A **data plane** performs the ongoing work: receive, process, store, and serve data. A **control plane** configures and manages that work. The boundary depends on the system; naming components does not establish independence.

For a customer-owned deployment, ask what happens if the vendor's control plane cannot reach it for an hour. Can existing collection continue? Which configuration remains valid? Can a customer still query? Where are credentials stored? How does reconnection avoid overwriting newer state?

A design that reconciles desired and observed state should make repeated actions safe. “Create a cluster” followed by a timeout is ambiguous; blindly creating another cluster can duplicate resources. Stable resource identities and observed-state checks matter.

### Limit the effect of one bad rollout

Rolling an update through hundreds of environments all at once turns one defect into a fleet outage. A staged rollout needs a meaningful health signal, a stop condition, version visibility, and a rollback story. Customers may run different versions or deny a permission you expected. A single global “deployed” flag cannot describe that state.

Helm packages Kubernetes resources. Terraform manages provider resources and their state. An operator continuously reconciles a domain-specific API. These mechanisms overlap, but stacking all three around the same mutable field can create competing owners. Decide which one owns each resource and which changes it may undo.

### Work through one design question

A customer revokes control-plane credentials while their telemetry ingest remains healthy. What should the UI say?

<details><summary>Reasoning</summary>

Show management connectivity and data-plane health separately, with observation timestamps. “Unreachable by the controller” is not evidence that ingest stopped. Avoid reporting a stale healthy observation as current. Define what existing workloads can do without renewed credentials, and provide a customer-controlled recovery path. There is no reason to delete working customer data merely because a management call failed.

</details>

Optional depth: [ClickHouse primary indexes](https://clickhouse.com/docs/primary-indexes), [VictoriaMetrics cardinality guidance](https://docs.victoriametrics.com/guides/understand-your-setup-size/), and [the Relay Operator project](#/read/project%3Arelay-operator/overview). No operator implementation is required for this course.
