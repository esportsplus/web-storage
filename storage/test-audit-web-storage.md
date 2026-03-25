# Test Audit: @esportsplus/web-storage

## Summary

| Metric | Value |
|--------|-------|
| Source modules | 5 |
| Tested modules | 3 (60%) |
| Test files | 3 |
| Total tests | 91 |
| Benchmarked modules | 0 (0%) |
| Gaps found | 9 (3 MED, 6 LOW) |

Type-only modules (`types.ts`, `constants.ts`) excluded — no runtime logic.


## Coverage Map

### src/drivers/localstorage.ts — 27 tests in tests/drivers/localstorage.ts

| Method | Happy Path | Empty/Missing | Error/Edge | Notes |
|--------|-----------|---------------|------------|-------|
| constructor | prefix format ✅ | — | — | |
| all() | ✅ | empty ✅ | unparseable skip ✅ | |
| clear() | ✅ | — | prefix isolation ✅ | |
| count() | ✅ | zero ✅ | — | |
| delete() | ✅ | non-existent ✅ | — | |
| get() | str/num/arr/obj ✅ | undefined ✅ | — | |
| keys() | ✅ | empty ✅ | — | |
| map() | specific values ✅ | — | unparseable skip ✅ | **empty store missing** |
| only() | ✅ | no matches ✅ | non-existent skip ✅ | |
| replace() | ✅ | — | — | |
| set() | returns true ✅ | — | quota exceeded → false ✅ | overwrite ✅ |

### src/drivers/indexeddb.ts — 25 tests in tests/drivers/indexeddb.ts

| Method | Happy Path | Empty/Missing | Error/Edge | Notes |
|--------|-----------|---------------|------------|-------|
| connect() | ✅ | — | — | reuse ✅ |
| all() | ✅ | empty ✅ | — | |
| clear() | ✅ | — | — | |
| count() | ✅ | zero ✅ | — | |
| delete() | ✅ | non-existent ✅ | — | |
| get() | str/num/arr/obj ✅ | undefined ✅ | — | |
| keys() | ✅ | empty ✅ | — | |
| map() | specific values ✅ | empty ✅ | — | |
| only() | ✅ | no matches ✅ | non-existent skip ✅ | |
| replace() | ✅ (overwrite) | — | — | |
| set() | returns true ✅ | — | — | overwrite ✅ |

### src/index.ts — 39 tests in tests/index.ts

| Method | LS | LS+Encrypt | IDB | IDB+Encrypt |
|--------|----|-----------|-----|-------------|
| factory | ✅ | ✅ | ✅ (default) | — |
| all() | ✅ | ✅ | ✅ | ❌ |
| clear() | ✅ | — | ✅ | — |
| count() | ✅ | — | ✅ | — |
| delete() | ✅ | — | ✅ | — |
| filter() | ✅ + stop | — | ✅ + stop | — |
| get() | str/num/arr/obj ✅ | str/num/arr ✅ | ✅ | str/obj ✅ |
| keys() | ✅ | — | ✅ | — |
| length() | ✅ | — | ✅ | — |
| map() | specific values ✅ | — | specific values ✅ | — |
| only() | ✅ | — | ✅ | — |
| replace() | ✅ | ✅ | ✅ | — |
| set() | str/num/arr/obj ✅ | str/num/arr ✅ | ✅ | str/obj ✅ |

**Error branches (LS+Encrypt):**
| Branch | Status |
|--------|--------|
| decrypt fails → get returns undefined | ✅ |
| encrypt fails → replace returns failed[] | ✅ |
| encrypt fails → set returns false | ✅ |


## Remaining Gaps

### MED

| # | Location | Gap | Why MED |
|---|----------|-----|---------|
| 1 | tests/drivers/localstorage.ts `map()` | Empty store — no callback invocations not tested | IDB map has this test; LS does not. Asymmetric. |
| 2 | tests/index.ts Local IDB+encrypt | `all()` with encryption via IDB not tested | `all()` deserializes each entry — the IDB+encrypt path exercises cursor + decrypt loop together |
| 3 | tests/index.ts Local | `get()` on non-existent key not tested at Local level | Covered at driver level but deserialize(undefined, secret) path untested at integration level |

### LOW

| # | Location | Gap | Why LOW |
|---|----------|-----|---------|
| 4 | indexeddb.ts:22 | `connect` onerror path | Hard to trigger with fake-indexeddb; defensive error handling |
| 5 | indexeddb.ts:32 | `promisify` onerror path | Same — requires IDB request failure |
| 6 | indexeddb.ts:17 | `onupgradeneeded` when objectStore already exists | Defensive branch; fake-indexeddb doesn't easily simulate |
| 7 | indexeddb.ts:176-178 | `set` returning false on error | Requires IDB write failure — hard to trigger |
| 8 | index.ts:49 | `version = 1` default | All tests pass explicit version; trivial default |
| 9 | index.ts:27-28 | `serialize` null/undefined passthrough | TypeScript prevents this at call sites |


## Missing Benchmarks

| Module | Export | Reason |
|--------|--------|--------|
| src/drivers/localstorage.ts | `all()`, `map()` | Full scan + parse per entry |
| src/drivers/indexeddb.ts | `all()`, `map()` | Parallel IDB reads / cursor iteration |
| src/index.ts | `filter()`, `replace()` | Full scan + deserialize + predicate / batch serialize |


## Stale Tests

None found.


## Recommendations

1. Add `map()` empty store test to LocalStorageDriver (1 test — closes MED #1)
2. Add `all()` with encryption via IDB (1 test — closes MED #2)
3. Add `get()` non-existent key at Local level (1 test — closes MED #3)
4. LOW gaps (#4-9) are acceptable risk — internal IDB error paths require mocking IndexedDB internals which adds fragile test infrastructure for minimal coverage gain
5. Add CI test step — GitHub workflows still only build/publish with no test gate
