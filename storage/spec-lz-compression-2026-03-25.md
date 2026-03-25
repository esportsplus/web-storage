# LZ Compression (Inlined) Spec

## Metadata
- **Generated**: 2026-03-25
- **Research sources**: lz-string GitHub (pieroxy/lz-string), algorithm gist (mildsunrise/c24045a3eb4ec3e15b69af2a837b8392), optimization PR #98, storage/feature-research.md
- **Threshold**: 10% minimum improvement
- **Benchmark command**: N/A (capacity optimization, not throughput)

## Baseline
- **Commit**: 5cf46e1
- **Test suite**: 212 passing, 0 failing
- **Benchmark**: N/A

## Features

### [P1] LZW Compression Module

- **Type**: feature
- **Status**: PENDING
- **Source**: lz-string algorithm analysis, feature-research.md > Compression
- **Rationale**: localStorage has a hard 5MB limit. LZW compression achieves 2-10x capacity gain on JSON data (78-88% reduction). Inlining avoids the 4KB lz-string dependency while giving us control over the hot path. The algorithm is public domain (LZW patents expired 2003-2004).
- **Changes**: New compression module providing `compress` and `decompress` functions (16-bit UTF-16, +1 offset, Map-based dictionary)
- **Layers**: utility module (pure functions, no side effects)
- **Acceptance**: Round-trip correctness for all input types (empty string, ASCII, Unicode, JSON strings of varying size), 0 test regressions
- **Notes**:

  #### Algorithm: Modified LZW with Variable-Width Codes

  lz-string uses a modified LZW (Lempel-Ziv-Welch) algorithm — an LZ78 variant with a growing dictionary, NOT a sliding window (LZ77). Both compressor and decompressor build identical dictionaries deterministically — no dictionary transmission needed.

  #### Opcodes (variable-width)

  | Opcode | Meaning | Followed by |
  |--------|---------|-------------|
  | 0 | 8-bit literal | 8 bits: character code |
  | 1 | 16-bit literal | 16 bits: character code |
  | 2 | End of stream | nothing |
  | 3+ | Dictionary reference | nothing (value = opcode - 3) |

  Bit width starts at 2 (can encode 0-3). When `dictSize` reaches `2^numBits`, increment `numBits`. Maximum 16 bits.

  #### Compression Algorithm

  ```
  1. Init: dictSize = 3, numBits = 2, enlargeIn = 2
  2. dictionary = {} (empty — entries added dynamically)
  3. For each character C in input:
     a. If W+C exists in dictionary → W = W+C (extend match)
     b. Else:
        - If W is a new character not yet emitted:
          - If charCode < 256: emit opcode 0, then 8-bit charCode
          - Else: emit opcode 1, then 16-bit charCode
          - Mark character as emitted
        - Else: emit dictionary[W] + 3 (offset by reserved opcodes)
        - Add W+C to dictionary at dictSize++
        - Check enlargeIn: if 0, double it, increment numBits
        - W = C
  4. Emit final W (same literal-vs-dictionary logic)
  5. Emit opcode 2 (EOF)
  6. Flush bit buffer
  ```

  #### Decompression Algorithm

  ```
  1. Init: dictSize = 4, numBits = 3, enlargeIn = 4
     (decompressor starts one step ahead because first entry is consumed)
  2. Read first code:
     - 0 → read 8-bit literal, output it
     - 1 → read 16-bit literal, output it
     - 2 → return empty string
  3. Set W = first output, result = [W]
  4. Loop: read next code at current numBits
     a. If code == 2 → break (EOF)
     b. If code == dictSize (edge case: references entry being created):
        entry = W + W[0]
     c. Else if code < dictSize:
        entry = dictionary[code] (or the literal if code < 3)
     d. Else: return error
     e. Append entry to result
     f. Add to dictionary: W + entry[0] at dictSize++
     g. Check enlargeIn: if 0, double it, increment numBits
     h. W = entry
  5. Return joined result
  ```

  #### UTF-16 Encoding (16-bit + offset 1)

  **Why 16 bits**: lz-string uses 15 bits (+32 offset) for cross-browser/XHR safety. We only target localStorage/sessionStorage where the sole hazard is null bytes (U+0000). Using 16 bits with +1 offset maps output to range [1, 65536] — all non-null values survive localStorage round-trips. This gives 6.7% better storage density than lz-string's 15-bit scheme.

  **Compress output**: Pack bits into 16-bit groups. When 16 bits accumulated, emit `String.fromCharCode(value + 1)`. Flush remaining bits at end. Append a trailing character encoding the number of valid bits in the last data character (value + 1, so 0 valid bits = charCode 1, 15 valid bits = charCode 16).

  **Decompress input**: For each character, subtract 1 to recover 16-bit value. Extract bits from the stream. The trailing character (subtract 1) indicates how many bits are valid in the final data character.

  #### Implementation Guidance

  - **Module location**: New source file adjacent to the drivers
  - **Exports**: Two functions only — `compress(input: string): string` and `decompress(compressed: string): string`
  - **Empty/null handling**: Empty string → return empty string. Null → return empty string.
  - **Dictionary**: Use `Map<string, number>` for compression (faster lookups than plain objects for string keys at scale). Use `string[]` for decompression (integer index → string).
  - **Bit buffer**: Accumulate bits in a number, flush to output array when reaching 16 bits. Use `String.fromCharCode()` on the array at the end to build the result string.
  - **Output building**: Use `string[]` array with `.join('')` at the end — never string concatenation in the loop.
  - **Performance**: All data structures are local to the function call (no module-level mutable state). The dictionary is rebuilt per invocation.
  - **No streaming**: Entire input is processed in one call. No chunking needed for localStorage payloads (< 5MB).
  - **No lz-string compatibility**: This is a standalone implementation. Wire format is NOT compatible with lz-string. Optimized for our use case (localStorage-only, 16-bit encoding).

  #### Test Requirements

  - Round-trip: `decompress(compress(x)) === x` for:
    - Empty string
    - Single character
    - Short ASCII strings (< 100 bytes)
    - Long repetitive strings (1000+ chars of repeated pattern)
    - JSON-like strings with structural repetition (`{"key":"value","key2":"value2",...}`)
    - Unicode strings (emoji, CJK characters, mixed scripts)
    - Strings with all 256 byte values
  - Compression ratio: verify repetitive 1KB JSON compresses to < 50% of original
  - Boundary: verify very short strings still round-trip (even if compression makes them larger)
  - No lz-string cross-validation (formats intentionally differ for better density)


### [P2] localStorage/sessionStorage Driver Integration

- **Type**: feature
- **Status**: PENDING
- **Source**: feature-research.md > Compression
- **Rationale**: Transparent compression multiplies effective localStorage capacity by 2-10x without any API changes. The 100-byte threshold ensures small values aren't penalized by LZ framing overhead.
- **Changes**: localStorage and sessionStorage drivers' read/write pipelines
- **Layers**: driver serialization layer
- **Acceptance**: All existing driver tests pass, compressed values readable, values < 100 bytes stored uncompressed, 0 test regressions
- **Notes**:

  #### Serialization Pipeline

  **Write path** (set, replace):
  ```
  value → JSON.stringify → [compress if ≥ 100 bytes] → [encrypt if secret] → localStorage.setItem
  ```

  **Read path** (get, all, map, only):
  ```
  localStorage.getItem → [decrypt if secret] → [decompress if compressed] → JSON.parse → value
  ```

  Note: compression runs BEFORE encryption on write, and AFTER decryption on read. This is because compression works best on structured plaintext (JSON), not on encrypted ciphertext (which appears random and is incompressible).

  #### 100-Byte Threshold

  After `JSON.stringify`, if the resulting string is < 100 bytes, store as-is (standard JSON). If ≥ 100 bytes, compress with `compress`.

  Why 100 bytes: LZ framing overhead (dictionary initialization, opcodes, bit packing, +32 offset) adds ~20-40 bytes of fixed cost. Below 100 bytes, the compressed output is often the same size or larger than the input. At 100+ bytes, structural repetition in JSON reliably yields compression gains.

  #### Compressed Value Detection

  On read, the driver must distinguish compressed values from uncompressed JSON. Strategy: **prefix marker**.

  Store compressed values with a single-character prefix that is NOT valid JSON. JSON values always start with one of: `{`, `[`, `"`, `t`, `f`, `n`, or a digit/minus. Use prefix `\x01` (SOH control character, ASCII 1) — it cannot appear as the first character of valid JSON.

  - **Write**: if compressed, store `'\x01' + compress(jsonString)`
  - **Read**: if value starts with `'\x01'`, decompress `value.slice(1)` then `JSON.parse`. Otherwise, `JSON.parse` directly.

  This is fully backward compatible: existing uncompressed values don't start with `\x01`, so they parse normally.

  #### Integration Points

  Both `LocalStorageDriver` and `SessionStorageDriver` share the same serialization logic. The compression should be added to the private `parse()` method (read) and the `JSON.stringify` calls in `set()` and `replace()` (write).

  Specifically:
  - `set(key, value)`: `let json = JSON.stringify(value); let stored = json.length >= 100 ? '\x01' + compress(json) : json;` then `sessionStorage.setItem(this.key(key), stored);`
  - `replace(entries)`: same logic per entry
  - `parse(value)`: if `value` starts with `'\x01'`, decompress first, then JSON.parse

  #### Test Requirements

  - Existing driver tests must pass unchanged (backward compat)
  - Small values (< 100 bytes JSON) stored without compression prefix
  - Large values (≥ 100 bytes JSON) stored with compression prefix
  - Round-trip: large JSON objects survive set/get
  - Mixed: store of small values followed by large values, all retrievable
  - Verify compressed output is smaller than uncompressed for repetitive JSON
  - Cross-driver: compressed value from localStorage driver can't leak to IndexedDB/Memory (drivers are independent)


## Rejected Alternatives

### Compression — Rejected: lz-string dependency
- **Source**: feature-research.md > Compression
- **Reason rejected**: Adds 4KB external dependency for two functions. Inlining gives control over the hot path, eliminates a supply chain dependency, and produces identical output. The LZW algorithm is public domain.

### Compression — Rejected: lz-string wire compatibility
- **Source**: User direction
- **Reason rejected**: Compatibility with lz-string's 15-bit (+32 offset) UTF-16 encoding wastes 6.7% storage density. Since this is a new library with no existing compressed data to migrate, we use an optimized 16-bit (+1 offset) encoding that maximizes capacity within the 5MB localStorage limit.

### Compression — Rejected: IndexedDB compression
- **Source**: feature-research.md > Compression
- **Reason rejected**: IndexedDB has no meaningful quota pressure (60% of disk). Compression overhead (CPU) isn't justified when storage is abundant. localStorage's hard 5MB limit is the specific constraint being solved.

## Summary
- **Total features**: 2
- **Completed**: 0
- **Reverted**: 0
- **Blocked**: 0
- **Net benchmark change**: N/A (capacity optimization)
