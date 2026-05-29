# MongoDB production requirements

## Why a replica set matters

The clinic queue system uses **MongoDB multi-document transactions** for:

- **`PATCH /queue/serve-next`** — atomically completes the current serving patient and promotes the next FIFO waiting patient (prevents two patients in `serving` at once under concurrency).
- **`POST /appointments/book`** — counts active bookings and inserts an appointment in one transaction (enforces the 5-per-slot limit under race conditions).

On a **standalone** MongoDB instance (`mongod` without replica set), transactions may:

- Fail at runtime with errors about transactions not being supported, or
- Not provide the same atomicity guarantees you expect in production.

## What breaks without a replica set

| Feature | Risk on standalone |
|--------|---------------------|
| Serve next (concurrent clicks) | Multiple `serving` patients possible |
| Appointment booking (same slot) | Slot limit may be exceeded briefly |

## Startup warning

On boot, the API runs `replSetGetStatus`. If no replica set is detected, logs include:

```
Queue transactions require MongoDB replica set for full safety...
```

This is a **warning only** — the server still starts (local dev friendly).

## Recommended production setup

1. Use **MongoDB Atlas** (replica set by default), or
2. Self-host a 3-node replica set.

Minimum for development with transactions: single-node replica set:

```bash
mongod --replSet rs0 --port 27017 --dbpath /data/db
mongosh --eval 'rs.initiate()'
```

## Environment

Set `MONGODB_URI` to your replica set connection string, for example:

```
MONGODB_URI=mongodb://localhost:27017/clinic-queue?replicaSet=rs0
```
