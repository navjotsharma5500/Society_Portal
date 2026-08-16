# Optional Redis cache

MongoDB and the REST API remain authoritative. Redis is used only for small, short-lived reference-data caches and can be disabled or unavailable without disabling portal functionality.

For local development without Redis:

```env
REDIS_ENABLED=false
```

To enable Redis:

```env
REDIS_ENABLED=true
REDIS_URL=redis://localhost:6379
```

Use a secret-managed URL in deployed environments. Never expose `REDIS_URL` to the frontend. The client uses bounded reconnect attempts, cache operations fail open to MongoDB, and the health endpoint reports only `connected`, `degraded`, or `disabled`.

The current Socket.IO server remains single-instance and does not use the Redis adapter. A future multi-instance deployment can attach `@socket.io/redis-adapter` inside the isolated realtime initialization layer without changing business services.
