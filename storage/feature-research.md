# Feature Research: @esportsplus/web-storage

Research date: 2026-03-24
Sources: localForage, Dexie.js, idb-keyval, store2, RxDB, unstorage, lz-string, lscache, expired-storage, proxy-storage, Valtio, Podda


## What We Already Have

- Two drivers: IndexedDB (default), localStorage
- Unified async API: get, set, delete, all, clear, count, keys, map, filter, only, replace
- AES-GCM encryption with optional secret
- TypeScript generics (`Local<T>` with per-key type inference)
- Namespace isolation via `name:version:` prefix (LS) / separate databases (IDB)
- Connection pooling for IndexedDB
- Factory pattern for independent instances


## Recommended Features (Priority Order)


### 1. TTL / Expiration (HIGH)

The most universally requested missing feature across storage libraries.

**What**: Per-key time-to-live. `set(key, value, { ttl: 60000 })` stores an expiry timestamp alongside the value. On `get`, expired entries return `undefined` and are lazily deleted.

**Why**: Without TTL, consumers reimplement expiry logic on every project. Cache use cases are impossible without it. lscache, expired-storage, and dozens of wrappers exist solely for this.

**Approach**: Envelope wrapping — store `{ value, expiry }` instead of raw value. Lazy deletion on read (check expiry on `get`). Optional proactive sweep via `cleanup()` method.

**API surface**:
```typescript
await store.set('session', token, { ttl: 3600000 }); // 1 hour
await store.get('session'); // undefined after expiry
await store.ttl('session'); // remaining ms, or -1 if no TTL
await store.persist('session'); // remove TTL, make permanent
await store.cleanup(); // proactively sweep all expired entries
```

**Implemented by**: lscache, expired-storage, ttl-db, localstorage-slim, Redis


### 2. Memory Driver (HIGH)

**What**: In-memory `Driver<T>` backed by a `Map`. Non-persistent — data lost on page reload.

**Why**: Essential for unit testing (no browser APIs needed), SSR environments (no `localStorage`/`indexedDB`), and as a fallback when persistent storage is unavailable (private browsing, quota exceeded). Every major library offers this.

**Approach**: Implement `Driver<T>` interface with a `Map<keyof T, T[keyof T]>`. Trivial — the interface already exists.

**API surface**:
```typescript
import storage, { DriverType } from '@esportsplus/web-storage';

let store = storage({ driver: DriverType.Memory, name: 'test', version: 1 });
```

**Implemented by**: localForage (plugin), unstorage (default), proxy-storage


### 4. `get(key, factory)` — Lazy Init (HIGH)

**What**: Optional second parameter on `get`. If the key is missing and a factory is provided, call the factory to produce the value, fire-and-forget the `set` (do not await it), and return the value immediately.

**Why**: Extremely common pattern that every consumer reimplements. Especially useful for expensive computations or API calls that should be cached. The fire-and-forget write means the caller is never blocked by storage I/O — the value is returned as soon as the factory resolves.

**Behavior**:
1. `get(key)` — existing behavior, returns `T[keyof T] | undefined`
2. `get(key, factory)` — if value exists, return it. If missing, call `factory()`, persist the result via `set` without awaiting, return the factory value. Factory can be sync or async.

**API surface**:
```typescript
// Without factory — unchanged, returns T[keyof T] | undefined
let user = await store.get('user');

// With factory — returns T[keyof T] (never undefined)
let user = await store.get('user', async () => {
    return await fetchUser(id);
});

// Sync factory works too
let count = await store.get('count', () => 0);
```

**Implementation note**: The `set` call is intentionally not awaited. The returned value comes from the factory, not from a subsequent read. This means the caller gets the value immediately while the write happens in the background. If the write fails silently, the next `get` with a factory will simply re-invoke it.

**Implemented by**: Common pattern, no library does it particularly well


### 5. Compression (HIGH for localStorage)

**What**: Always-on LZ-based compression for the localStorage driver. Multiplies effective capacity by 2-10x.

**Why**: localStorage has a hard 5MB limit. Users consistently hit this wall. IndexedDB has no meaningful quota pressure (60% of disk), so compression is localStorage-only.

**Approach**: Built into the localStorage driver's serialize/deserialize pipeline. No configuration — always active, but with a 100-byte threshold: values under 100 bytes are stored as-is (LZ framing overhead would make them larger), values at or above 100 bytes are compressed via `lz-string` `compressToUTF16`. On read, detect whether the stored value is compressed and decompress accordingly. Compression runs before encryption when a secret is present (compress → encrypt on write, decrypt → decompress on read).

**No API surface** — this is an internal optimization. No user-facing option or configuration. The localStorage driver always compresses large values transparently.

**Implemented by**: lz-string, localstorage-slim, locally (locallyjs)


### 6. Change Subscriptions (MEDIUM-HIGH)

**What**: `subscribe(key, callback)` fires when a value changes. Returns an unsubscribe function.

**Why**: Essential for UI framework integration. Dexie's `liveQuery` and RxDB's reactive queries are headline features. A minimal event emitter per key fills the gap between the storage library and the UI layer.

**Approach**: Internal `Map<keyof T, Set<Callback>>` in `Local<T>`. Fire callbacks after `set`, `delete`, `replace`, `clear` complete. No cross-tab sync (keep it simple).

**API surface**:
```typescript
let unsubscribe = store.subscribe('theme', (newValue, oldValue) => {
    applyTheme(newValue);
});

// or subscribe to all changes
let unsubscribe = store.subscribe((key, newValue, oldValue) => {
    console.log(`${key} changed`);
});
```

**Implemented by**: Podda, Valtio, unstorage, local-storage-proxy


### 7. Migration Callbacks (MEDIUM-HIGH)

**What**: Run transform functions when the version number changes. The `version` parameter already exists but has no migration path.

**Why**: Critical for production apps that evolve their schema. Without migrations, a version bump silently loses or corrupts data. Dexie and RxDB consider this a core feature.

**Approach**: Accept a `migrations` map in options. On construction, detect version change and run the appropriate migration function before the store becomes usable.

**API surface**:
```typescript
let store = storage<AppDataV2>({
    name: 'app',
    version: 2,
    migrations: {
        2: async (old) => {
            // Transform v1 data to v2 shape
            let all = await old.all();
            return { ...all, newField: defaultValue };
        }
    }
});
```

**Implemented by**: Dexie (`upgrade()`), RxDB (`migrationStrategies`)


### 9. sessionStorage Driver (MEDIUM)

**What**: Per-tab ephemeral storage via `sessionStorage`.

**Why**: Fills a real gap for per-tab state (form drafts, wizard progress, auth tokens). Trivial to implement — copy `LocalStorageDriver` and swap `localStorage` for `sessionStorage`.

**API surface**:
```typescript
let store = storage({ driver: DriverType.SessionStorage, name: 'tab', version: 1 });
```

**Implemented by**: store2 (`store.session`)

### 11. OPFS Driver (LOW — emerging)

**What**: Origin Private File System — 3-4x faster than IndexedDB for large binary data. Accessed via Web Worker using `FileSystemSyncAccessHandle`.

**Why**: Emerging as the fastest browser storage for performance-sensitive apps. RxDB reports significant speed gains. However, browser support is still maturing and the API is complex.

**Approach**: Defer until OPFS stabilizes further. Monitor adoption.

**Implemented by**: RxDB, opfs-tools