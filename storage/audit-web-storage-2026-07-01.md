# Audit: @esportsplus/web-storage

- **Project:** @esportsplus/web-storage v0.5.1
- **Date:** 2026-07-01
- **Commit:** 8d6b13a
- **Scope:** architecture + performance, API-preserving. Public API = default factory `(options, secret?) => Local<T>`, `DriverType`, `type Local`, plus stored-data formats: plain JSON / `\x01`+LZ strings in local/sessionStorage, structured-clone values in IndexedDB, TTL envelope `{__e,__v}`. All findings preserve every stored-data format — the LZ change is proven byte-identical.
- **Coverage:** all 8 files under src/ read in full (constants.ts, index.ts, lz.ts, types.ts, drivers/indexeddb.ts, drivers/localstorage.ts, drivers/memory.ts, drivers/sessionstorage.ts); tests/ skimmed for driver-method usage.
- **Benchmarks:** Node via tsx; warmup + 7 runs, median reported; two independent runs per claim. Scripts (session scratchpad, ephemeral — numbers recorded here): `bench-web-storage/bench-lz.ts`, `bench-web-storage/bench-index.ts`, `bench-web-storage/probe-edge.ts`, `bench-web-storage/probe-inflation.ts` under `C:\Users\ICJR\AppData\Local\Temp\claude\d--temp\33f71bd0-ccda-4e9d-b191-10c82d19f781\scratchpad\`. Reference implementations that produced the numbers: `bench-web-storage/optimized/lz.ts` (F-001), `bench-web-storage/patched/index.ts` (F-002, F-003).

## Findings

### src/types.ts

#### F-005: Driver.count() and Driver.keys() are dead interface surface

- **File:** src/types.ts:7,10; src/drivers/indexeddb.ts:74-79,103-108; src/drivers/localstorage.ts:80-90,102-104; src/drivers/memory.ts:39-41,53-55; src/drivers/sessionstorage.ts:80-90,102-104
- **Symbol:** `Driver.count`, `Driver.keys`
- **Category:** architecture
- **Priority:** P2
- **Evidence:** Grep-proven: `index.ts` never calls `driver.count()` or `driver.keys()` — `Local.count()`/`Local.keys()` must iterate via `driver.map()` because TTL-expired entries require value inspection, which raw driver counts/keys cannot do. Only the driver unit tests (tests/drivers/*.ts) exercise these methods. The `Driver` type is internal: package entry exports only the default factory, `DriverType`, and `type Local`.
- **Recommendation:** Remove `count()` and `keys()` from the `Driver<T>` interface and all four driver implementations; delete the corresponding driver-test blocks. Public `Local.count/keys/length` are untouched. (F-004's unification shrinks this to one deletion site for the web-storage pair.)
- **Risk:** Low. No runtime caller; test deletions are for dead surface, not behavior.
- **LOC delta:** ~ -60 (incl. tests)
- **Recommended-model:** sonnet
