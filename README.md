# @esportsplus/web-storage

Typed async storage with multiple backends, TTL, encryption, compression, subscriptions, and migrations.

```typescript
import storage, { DriverType } from '@esportsplus/web-storage';

type UserData = { name: string; preferences: { theme: string } };

let store = storage<UserData>({ name: 'app', version: 1 });

await store.set('name', 'alice');
await store.get('name'); // 'alice'
```


## Install

```bash
pnpm add @esportsplus/web-storage
```


## Drivers

| Driver | Persistence | Compression | Use Case |
|--------|------------|-------------|----------|
| IndexedDB | Permanent | No | Default. Large data, no quota pressure |
| localStorage | Permanent | Yes (LZ) | Small data, 5MB limit |
| sessionStorage | Per-tab | Yes (LZ) | Tab-scoped state |
| Memory | None | No | Testing, SSR, fallback |

```typescript
// IndexedDB (default)
let store = storage<T>({ name: 'app', version: 1 });

// localStorage
let store = storage<T>({ driver: DriverType.LocalStorage, name: 'app', version: 1 });

// sessionStorage
let store = storage<T>({ driver: DriverType.SessionStorage, name: 'app', version: 1 });

// Memory (non-persistent)
let store = storage<T>({ driver: DriverType.Memory, name: 'app', version: 1 });
```


## API

All methods are async and fully typed via `Local<T>`.

### Core CRUD

```typescript
// Set a value
await store.set('name', 'alice');

// Get a value
let name = await store.get('name'); // string | undefined

// Get with factory (lazy init — never returns undefined)
let name = await store.get('name', () => 'default');
let user = await store.get('name', async () => await fetchUser());

// Delete keys
await store.delete('name', 'preferences');

// Replace multiple values
let failed = await store.replace({ name: 'bob', preferences: { theme: 'dark' } });

// Get all entries
let all = await store.all();

// Get specific keys
let subset = await store.only('name', 'preferences');

// Count entries
let count = await store.count();

// List keys
let keys = await store.keys();

// Clear everything
await store.clear();
```

### Iteration

```typescript
// Map over all entries
await store.map((value, key, i) => {
    console.log(key, value);
});

// Filter entries (with early stop)
let result = await store.filter(({ key, value, stop }) => {
    if (key === 'name') {
        stop(); // halt iteration
    }

    return typeof value === 'string';
});
```


## TTL / Expiration

Per-key time-to-live in milliseconds. Expired entries return `undefined` and are lazily deleted.

```typescript
// Set with 1 hour TTL
await store.set('session', token, { ttl: 3600000 });

// Check remaining time (-1 if no TTL or expired)
await store.ttl('session'); // ms remaining

// Remove TTL (make permanent)
await store.persist('session');

// Proactively sweep all expired entries
await store.cleanup();
```


## Encryption

Optional AES-GCM encryption via a secret string.

```typescript
let store = storage<T>({ name: 'secure', version: 1 }, 'my-secret-key');

await store.set('token', 'sensitive-data'); // encrypted at rest
await store.get('token'); // 'sensitive-data' (decrypted)
```


## Change Subscriptions

Subscribe to value changes. Returns an unsubscribe function.

```typescript
// Per-key subscription
let unsubscribe = store.subscribe('name', (newValue, oldValue) => {
    console.log(`name: ${oldValue} -> ${newValue}`);
});

// Global subscription (all keys)
let unsubscribe = store.subscribe((key, newValue, oldValue) => {
    console.log(`${String(key)} changed`);
});

// Stop listening
unsubscribe();
```

Fires after: `set`, `delete`, `replace`, `clear`, `cleanup`.


## Migrations

Run transform functions when the version number changes.

```typescript
type V1 = { name: string };
type V2 = { displayName: string; name: string };

let store = storage<V2>({
    name: 'app',
    version: 2,
    migrations: {
        2: async (old) => {
            let data = await old.all();

            return {
                ...data,
                displayName: (data.name as string) || 'Anonymous'
            };
        }
    }
});
```

Migrations run sequentially. Version 1 to 3 runs migration 2 then migration 3. Each migration receives the current store data and returns the transformed data.


## Compression

localStorage and sessionStorage drivers automatically compress values >= 100 bytes using an inlined LZW compressor. No configuration needed.

- Values < 100 bytes: stored as JSON (LZ overhead not worth it)
- Values >= 100 bytes: LZ compressed (2-10x capacity gain on JSON)
- Backward compatible: existing uncompressed values read normally
- Runs before encryption on write, after decryption on read


## Factory Pattern (`get` with default)

```typescript
// Sync factory
let count = await store.get('count', () => 0);

// Async factory
let user = await store.get('user', async () => {
    return await fetchUser(id);
});
```

The factory is called only when the key is missing or expired. The produced value is persisted via a fire-and-forget `set` (caller isn't blocked by the write).


## Types

```typescript
import type { Local } from '@esportsplus/web-storage';
import { DriverType } from '@esportsplus/web-storage';

type Options = {
    driver?: DriverType;
    migrations?: Record<number, MigrationFn>;
    name: string;
    version: number;
};

type SetOptions = {
    ttl?: number;
};

type MigrationFn = (old: {
    all(): Promise<Record<string, unknown>>;
}) => Promise<Record<string, unknown>>;

// Subscription callbacks
type KeyCallback<T, K extends keyof T> = (
    newValue: T[K] | undefined,
    oldValue: T[K] | undefined
) => void;

type GlobalCallback<T> = (
    key: keyof T,
    newValue: T[keyof T] | undefined,
    oldValue: T[keyof T] | undefined
) => void;
```


## License

MIT
