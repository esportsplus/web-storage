# Audit: @esportsplus/web-storage

- **Project:** @esportsplus/web-storage v0.5.1
- **Date:** 2026-07-01
- **Commit:** 8d6b13a
- **Scope:** architecture + performance, API-preserving. Public API = default factory `(options, secret?) => Local<T>`, `DriverType`, `type Local`, plus stored-data formats: plain JSON / `\x01`+LZ strings in local/sessionStorage, structured-clone values in IndexedDB, TTL envelope `{__e,__v}`. All findings preserve every stored-data format — the LZ change is proven byte-identical.
- **Coverage:** all 8 files under src/ read in full (constants.ts, index.ts, lz.ts, types.ts, drivers/indexeddb.ts, drivers/localstorage.ts, drivers/memory.ts, drivers/sessionstorage.ts); tests/ skimmed for driver-method usage.
- **Benchmarks:** Node via tsx; warmup + 7 runs, median reported; two independent runs per claim. Scripts (session scratchpad, ephemeral — numbers recorded here): `bench-web-storage/bench-lz.ts`, `bench-web-storage/bench-index.ts`, `bench-web-storage/probe-edge.ts`, `bench-web-storage/probe-inflation.ts` under `C:\Users\ICJR\AppData\Local\Temp\claude\d--temp\33f71bd0-ccda-4e9d-b191-10c82d19f781\scratchpad\`. Reference implementations that produced the numbers: `bench-web-storage/optimized/lz.ts` (F-001), `bench-web-storage/patched/index.ts` (F-002, F-003).

## Findings

### src/lz.ts

#### F-001: LZ codec — bit-at-a-time I/O, string-concat dictionary keys, and stack-overflowing output build

- **File:** src/lz.ts:21-52 (`readBits`/`writeBits`), 55-118 (`compress`), 117 (`String.fromCharCode(...ctx.output)`)
- **Symbol:** `compress`, `decompress`, `readBits`, `writeBits`
- **Category:** performance
- **Priority:** P0
- **Evidence:** Three compounding costs: (1) `writeBits`/`readBits` loop one bit per iteration; (2) `compress` builds `w + c` substring keys and hashes them into a string-keyed Map — O(len) alloc+hash per step; (3) `String.fromCharCode(...ctx.output)` spreads the whole output array, which **throws `RangeError: Maximum call stack size exceeded`** once output exceeds V8's max argument count — reproduced with a 2MB low-compressibility JSON payload (in-contract: localStorage quota ~5MB, `MAX_DECOMPRESSED_SIZE` is 10MB), meaning `LocalStorageDriver.set()` silently returns `false` (its try/catch swallows the throw) and large values are silently dropped today. Optimized variant (multi-bit chunked read/write, numeric composite dictionary keys `wKey * 65536 + charCode`, chunked `fromCharCode`): compress **-43% to -81%** across payloads (json-1KB 0.036 → 0.017 ms; json-10KB 0.425 → 0.226 ms; json-100KB 8.29 → 3.20 ms; json-1MB 138.4 → 46.1 ms (-66.7%); hex-lowcomp-200KB 21.1 → 11.3 ms; unicode-50KB 3.6 → 0.7 ms). Decompress typically **-10% to -27%** (noisy, occasionally neutral on sub-ms payloads). 2MB payload compresses fine in the optimized variant (559,798 code units, chunked). **Stored-data compat proven:** compressed output is byte-identical to the original on all 6 payload classes + 8 edge cases + 500 random-unicode fuzz strings (incl. lone surrogates, NUL, U+FFFF), and cross-decompression verified both directions (`bench-lz.ts`, `probe-edge.ts`). Bitstream format unchanged — previously stored values remain readable, new values readable by old code.
- **Recommendation:** Replace `src/lz.ts` internals with the reference implementation at scratchpad `bench-web-storage/optimized/lz.ts`: multi-bit `writeBits`/`readBits` (consume up to 16 bits per iteration), compressor dictionary keyed by numeric composite (single-char state = charCode 0..65535, dict-entry state = 65536 + code; composite = `wKey * 65536 + cCode`, exact in float64), literal emission from char codes (no 1-char strings), and chunked output string building (8192-unit `String.fromCharCode` chunks joined). Exported signatures unchanged. Re-run the repo's tests/lz.ts suite plus a byte-identity fuzz against the previous implementation as the acceptance gate.
- **Risk:** Medium (codec correctness), fully mitigated by the byte-identity gate — any deviation from the original bitstream is detectable by direct string comparison, and the reference implementation already passes 508 fidelity cases.
- **LOC delta:** ~ +40 / -25
- **Recommended-model:** opus

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
