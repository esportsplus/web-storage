# Test Audit: @esportsplus/web-storage

## Summary
- Source modules: 8
- Tested modules: 8 (100%)
- Benchmarked modules: 0 (0%)
- Total tests: 253
- Total gaps found: 23

## Missing Tests (Priority Order)

| Module | Export / Path | Type | Risk |
|--------|-------------|------|------|
| Local<T> + SessionStorage | All Local<T> methods with SS driver | integration | HIGH — only 1 factory test exists for SS; zero method coverage at Local<T> layer |
| Local<T> + Memory | TTL methods (ttl, persist, cleanup) | integration | HIGH — TTL logic is driver-agnostic but untested against Memory driver |
| Local<T> + Memory | get(key, factory) | integration | MED — factory tested for IDB/LS but not Memory |
| Local<T> + Memory | encryption (with secret) | integration | MED — no encryption round-trip tests for Memory driver |
| Local<T> + Memory | filter, only, map, length | integration | MED — bulk read operations untested at Local<T> layer for Memory |
| Local<T> | persist() on non-existent key | edge case | MED — returns false by code inspection, no test |
| Local<T> | persist() on already-permanent key | edge case | LOW — returns true, no test |
| Local<T> | cleanup() subscription notifications | integration | MED — validator flagged: cleanup fires notify but no test covers it |
| Local<T> | get() TTL expiry + subscription | edge case | MED — expired get does fire-and-forget delete but bypasses subscription-aware delete path; behavior unclear |
| Local<T> | count() with VERSION_KEY present | edge case | MED — should return count-1 when migrations active; no test |
| Local<T> | keys() with VERSION_KEY present | edge case | MED — should exclude __version__; no test |
| Local<T> + encryption | get(key, factory) + encryption | integration | LOW — factory + encrypt combo untested |
| Local<T> + LS | compression + encryption combined | integration | MED — encrypted ciphertext stored via driver which may attempt compression; round-trip untested |

## Shallow Tests

| Module | Export | Covered | Missing |
|--------|--------|---------|---------|
| Local<T>.persist() | IDB, LS | happy path (has TTL, removes it) | non-existent key, already-permanent key, expired key |
| Local<T>.cleanup() | IDB, LS | removes expired entries | empty store, no expired entries, subscription notifications |
| Local<T>.clear() | IDB, LS, Memory | clears all + notifies | VERSION_KEY preserved after clear (migration stores re-init) |
| Local<T>.subscribe() | Memory | set, delete, replace, clear, unsubscribe | cleanup notifications, factory-triggered notifications, TTL expiry notifications |
| Local<T>.map() | IDB, LS, Memory | iterates entries | TTL filtering + VERSION_KEY filtering combined |
| LZ compress/decompress | round-trip | all string types | very large strings (>100KB), strings that produce larger output than input (random/high-entropy) |
| LocalStorageDriver.parse() | error handling | corrupted compressed data | corrupted non-compressed JSON, null byte in stored data |

## Missing Benchmarks

No benchmark infrastructure exists. For a storage library, benchmarks would be useful for:

| Module | Export | Reason |
|--------|--------|--------|
| LZ compress/decompress | compress() | Called on every localStorage write ≥100 bytes |
| LZ compress/decompress | decompress() | Called on every localStorage read of compressed data |
| LocalStorageDriver | set/get | Hot path for localStorage operations |
| IndexedDBDriver | set/get/all | Async I/O operations, would reveal contention |
| Local<T> | set with encryption | Encryption + serialization overhead |

## Stale Tests

None found. All test references match current exports.

## Recommendations

### Priority 1: SessionStorage Local<T> integration (HIGH)
The sessionStorage driver has full driver-level tests (36) but almost zero Local<T> integration tests (just 1 factory test). Add at minimum: set/get, all, delete, clear, count, keys — mirroring the existing Memory driver block. Encryption and TTL should also be tested since the driver shares serialization logic with localStorage but includes compression.

### Priority 2: Memory driver feature coverage (HIGH)
TTL, persist, cleanup, get(key, factory), encryption, and bulk read operations are untested at the Local<T> layer for the Memory driver. Since Memory is the recommended driver for unit testing, these gaps are ironic — users testing their own code with Memory may hit untested paths.

### Priority 3: Cross-feature edge cases (MED)
- cleanup() + subscription notifications
- get() TTL expiry + subscription side-effects
- count()/keys() with VERSION_KEY present (migrations active)
- Compression + encryption combined round-trip
- persist() on non-existent and already-permanent keys

### Priority 4: LZ compression boundaries (LOW)
- Very large strings (100KB+)
- High-entropy strings that don't compress
- Explicit test that compression never increases size by more than a bounded amount
