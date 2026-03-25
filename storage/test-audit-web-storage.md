# Test Audit: @esportsplus/web-storage

## Summary

| Metric | Value |
|--------|-------|
| Source modules | 5 |
| Tested modules | 3 (60%) |
| Test files | 3 |
| Total tests | 77 |
| Benchmarked modules | 0 (0%) |
| Gaps found | 22 |

Type-only modules (`types.ts`, `constants.ts`) excluded from tested count — no runtime logic.


## Coverage Map

### src/drivers/localstorage.ts — 25 tests in tests/drivers/localstorage.ts

| Method | Happy Path | Empty/Missing | Error Path | Edge Cases |
|--------|-----------|---------------|------------|------------|
| constructor | prefix format ✅ | — | — | — |
| all() | ✅ | empty ✅ | unparseable JSON skip ✅ | — |
| clear() | ✅ | — | — | prefix isolation ✅ |
| count() | ✅ | zero ✅ | — | — |
| delete() | ✅ | non-existent ✅ | — | — |
| get() | string/num/arr/obj ✅ | undefined ✅ | — | — |
| keys() | ✅ | empty ✅ | — | — |
| map() | value/key/index ✅ | — | unparseable skip ✅ | — |
| only() | ✅ | no matches ✅ | non-existent skip ✅ | — |
| replace() | ✅ | — | — | — |
| set() | returns true ✅ | — | — | — |

### src/drivers/indexeddb.ts — 23 tests in tests/drivers/indexeddb.ts

| Method | Happy Path | Empty/Missing | Error Path | Edge Cases |
|--------|-----------|---------------|------------|------------|
| connect() | ✅ | — | — | connection reuse ✅ |
| all() | ✅ | empty ✅ | — | — |
| clear() | ✅ | — | — | — |
| count() | ✅ | zero ✅ | — | — |
| delete() | ✅ | non-existent ✅ | — | — |
| get() | string/num/arr/obj ✅ | undefined ✅ | — | — |
| keys() | ✅ | empty ✅ | — | — |
| map() | value/key/index ✅ | empty (no invoke) ✅ | — | — |
| only() | ✅ | no matches ✅ | non-existent skip ✅ | — |
| replace() | ✅ (with overwrite) | — | — | — |
| set() | returns true ✅ | — | — | — |

### src/index.ts — 29 tests in tests/index.ts

| Method | LS | LS+Encrypt | IDB | IDB+Encrypt |
|--------|----|-----------|-----|-------------|
| factory | ✅ | ✅ | ✅ (default) | — |
| all() | ✅ | ✅ | ✅ | ❌ |
| clear() | ✅ | — | ✅ | — |
| count() | ✅ | — | ✅ | — |
| delete() | ✅ | — | ❌ | — |
| filter() | ✅ + stop | — | ❌ | — |
| get() | string/num/arr/obj ✅ | string/num/arr ✅ | ✅ | string/obj ✅ |
| keys() | ✅ | — | ❌ | — |
| length() | ✅ | — | ❌ | — |
| map() | ✅ | — | ❌ | — |
| only() | ✅ | — | ❌ | — |
| replace() | ✅ | ✅ | ❌ | — |
| set() | string/num/arr/obj ✅ | string/num/arr ✅ | ✅ | string/obj ✅ |


## Shallow Tests

| Test File | Method | Covered | Missing |
|-----------|--------|---------|---------|
| tests/drivers/localstorage.ts | `map()` | happy path, unparseable skip | empty store (no callback) |
| tests/drivers/localstorage.ts | `set()` | returns true | returns false (quota exceeded) |
| tests/drivers/localstorage.ts | `set()` | new key | overwrite existing key |
| tests/drivers/indexeddb.ts | `set()` | returns true | returns false on error |
| tests/drivers/indexeddb.ts | `set()` | new key | overwrite existing key |
| tests/drivers/indexeddb.ts | `map()` | iteration + empty | specific key/value content assertions (only checks `toBeDefined()`) |
| tests/drivers/localstorage.ts | `map()` | iteration | specific key/value content assertions (only checks `toBeDefined()`) |
| tests/index.ts | `filter()` | stop mechanism | stop assertion doesn't verify result exclusion of stopped entry |
| tests/index.ts | `map()` | iteration | weak assertions — `toBeDefined()` only, no value checks |
| tests/index.ts | `get()` | existing keys | non-existent key returning undefined (at Local level) |
| tests/index.ts | `replace()` | success | failed array path (encrypt throws → key pushed to failed[]) |
| tests/index.ts | `set()` | success | returns false when serialize throws |


## Missing Tests (Priority Order)

### HIGH — Asymmetric IDB coverage at Local level

The Local class wraps both drivers, but 7 methods are only tested via LocalStorage. IDB uses cursors, transactions, and async patterns that differ from localStorage — bugs in the IDB path would go undetected.

| Method | Risk | Details |
|--------|------|---------|
| `Local.delete()` via IDB | HIGH | IDB delete uses batch transaction with oncomplete/onerror |
| `Local.filter()` via IDB | HIGH | IDB map uses cursor — filter stop interacts with cursor.continue() |
| `Local.map()` via IDB | HIGH | cursor-based async iteration through Local's deserialize layer |
| `Local.only()` via IDB | HIGH | IDB only uses parallel Promise.all gets |
| `Local.keys()` via IDB | MED | thin wrapper, low risk |
| `Local.length()` via IDB | MED | alias for count, low risk |
| `Local.replace()` via IDB | MED | IDB replace uses batch transaction |

### HIGH — Error/failure branches

| Location | Branch | Risk |
|----------|--------|------|
| `index.ts:18-20` | `deserialize` catch (decrypt fails) → returns undefined | HIGH — silent data loss |
| `index.ts:163-165` | `replace` catch (serialize fails) → pushes to failed[] | HIGH — only success path tested |
| `index.ts:182-183` | `set` catch (serialize fails) → returns false | HIGH — only success path tested |
| `localstorage.ts:124-126` | `set` catch (quota exceeded) → returns false | MED — storage limit behavior |
| `indexeddb.ts:176-178` | `set` catch → returns false | MED — IDB write failure |

### MED — Weak assertions

| Test File | Method | Issue |
|-----------|--------|-------|
| tests/drivers/localstorage.ts | `map()` line 140-143 | Checks `entries[i].value` is `toBeDefined()` — not specific values |
| tests/drivers/indexeddb.ts | `map()` line 156-160 | Same weakness |
| tests/index.ts | `map()` line 251-254 | Same weakness |

### LOW — Minor gaps

| Location | Gap |
|----------|-----|
| `index.ts:49` | `version = 1` default not tested (all tests pass explicit version) |
| `indexeddb.ts:17` | `onupgradeneeded` when objectStore already exists (branch not exercised) |
| `indexeddb.ts:22` | `connect` onerror path |
| `indexeddb.ts:32` | `promisify` onerror path |


## Missing Benchmarks

| Module | Export | Reason |
|--------|--------|--------|
| src/drivers/localstorage.ts | `all()` | Iterates all keys + parse per entry |
| src/drivers/localstorage.ts | `map()` | Full scan with callback |
| src/drivers/indexeddb.ts | `all()` | Parallel IDB reads |
| src/drivers/indexeddb.ts | `map()` | Cursor iteration |
| src/index.ts | `filter()` | Full scan + deserialize + predicate |
| src/index.ts | `replace()` | Batch serialize + write |


## Stale Tests

None found.


## Recommendations

1. **Add IDB smoke tests** for `delete`, `filter`, `keys`, `map`, `only`, `replace` at the Local class level — 6 tests close the asymmetric coverage gap
2. **Test error branches**: make mock `encrypt` throw to exercise `replace` failed[] path and `set` returning false; make mock `decrypt` throw to exercise `deserialize` returning undefined
3. **Strengthen map assertions** in all 3 test files: assert specific key/value pairs instead of `toBeDefined()`
4. **Add `set` overwrite test** to both driver test files: set key, set same key to new value, verify get returns new value and count stays 1
5. **Add CI test step** — GitHub workflows only build/publish, no test gate before publish
