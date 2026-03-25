import { decrypt, encrypt } from '@esportsplus/utilities';
import type { Driver, Filter, GlobalCallback, KeyCallback, MigrationFn, Options, SetOptions, TTLEnvelope } from './types';
import { DriverType } from './constants';
import { IndexedDBDriver } from '~/drivers/indexeddb';
import { LocalStorageDriver } from '~/drivers/localstorage';
import { MemoryDriver } from '~/drivers/memory';
import { SessionStorageDriver } from '~/drivers/sessionstorage';


const VERSION_KEY = '__version__';


function isEnvelope<V>(value: unknown): value is TTLEnvelope<V> {
    return value !== null
        && typeof value === 'object'
        && '__e' in (value as Record<string, unknown>)
        && '__v' in (value as Record<string, unknown>);
}

async function deserialize<V>(value: unknown, secret: string | null): Promise<V | undefined> {
    if (value === undefined || value === null) {
        return undefined;
    }

    if (secret && typeof value === 'string') {
        try {
            value = await decrypt(value, secret);
            value = JSON.parse(value as string);
        }
        catch {
            return undefined;
        }
    }

    return value as V;
}

async function serialize<V>(value: V, secret: string | null): Promise<string | V> {
    if (value === undefined || value === null) {
        return value;
    }

    if (secret) {
        return encrypt(JSON.stringify(value), secret);
    }

    return value;
}

function notify<T>(
    globals: Set<GlobalCallback<T>>,
    listeners: Map<keyof T, Set<KeyCallback<T>>>,
    key: keyof T,
    newValue: T[keyof T] | undefined,
    oldValue: T[keyof T] | undefined
): void {
    let set = listeners.get(key);

    if (set) {
        for (let cb of set) {
            cb(newValue, oldValue);
        }
    }

    for (let cb of globals) {
        cb(key, newValue, oldValue);
    }
}

function unwrap<V>(value: unknown): { expired: boolean; hasTTL: boolean; value: V } {
    if (isEnvelope<V>(value)) {
        return {
            expired: Date.now() > value.__e,
            hasTTL: true,
            value: value.__v
        };
    }

    return { expired: false, hasTTL: false, value: value as V };
}

async function migrate<T>(driver: Driver<T>, migrations: Record<number, MigrationFn>, version: number): Promise<void> {
    let raw = await driver.get(VERSION_KEY as keyof T),
        stored = typeof raw === 'number' ? raw : 0;

    if (stored >= version) {
        return;
    }

    let keys = Object.keys(migrations).map(Number).filter((v) => v > stored && v <= version).sort((a, b) => a - b);

    for (let i = 0, n = keys.length; i < n; i++) {
        let all = await driver.all(),
            data: Record<string, unknown> = {};

        for (let key in all) {
            if (key !== VERSION_KEY) {
                data[key] = all[key as keyof T];
            }
        }

        let transformed = await migrations[keys[i]]({ all: () => Promise.resolve(data) });

        await driver.clear();

        let entries: [keyof T, T[keyof T]][] = [];

        for (let key in transformed) {
            entries.push([key as keyof T, transformed[key] as T[keyof T]]);
        }

        if (entries.length > 0) {
            await driver.replace(entries);
        }
    }

    await driver.set(VERSION_KEY as keyof T, version as T[keyof T]);
}


class Local<T> {

    private driver: Driver<T>;

    private globals: Set<GlobalCallback<T>>;

    private listeners: Map<keyof T, Set<KeyCallback<T>>>;

    private ready: Promise<void>;

    private secret: string | null;

    private version: number;


    constructor(options: Options, secret?: string) {
        this.globals = new Set();
        this.listeners = new Map();
        this.secret = secret || null;

        let { migrations, name, version = 1 } = options;

        this.version = version;

        if (options.driver === DriverType.LocalStorage) {
            this.driver = new LocalStorageDriver<T>(name, version);
        }
        else if (options.driver === DriverType.Memory) {
            this.driver = new MemoryDriver<T>(name, version);
        }
        else if (options.driver === DriverType.SessionStorage) {
            this.driver = new SessionStorageDriver<T>(name, version);
        }
        else {
            this.driver = new IndexedDBDriver<T>(name, version);
        }

        if (migrations) {
            this.ready = migrate(this.driver, migrations, version);
        }
        else {
            this.ready = Promise.resolve();
        }
    }


    async all(): Promise<T> {
        await this.ready;

        let expired: (keyof T)[] = [],
            raw = await this.driver.all(),
            result = {} as T;

        for (let key in raw) {
            if (key === VERSION_KEY) {
                continue;
            }

            let deserialized = await deserialize<T[keyof T] | TTLEnvelope<T[keyof T]>>(raw[key], this.secret),
                unwrapped = unwrap<T[keyof T]>(deserialized);

            if (deserialized === undefined) {
                continue;
            }

            if (unwrapped.expired) {
                expired.push(key as keyof T);
                continue;
            }

            (result as Record<string, unknown>)[key] = unwrapped.value;
        }

        if (expired.length > 0) {
            this.driver.delete(expired);
        }

        return result;
    }

    async clear(): Promise<void> {
        await this.ready;

        let allData = await this.all(),
            keys = Object.keys(allData as Record<string, unknown>) as (keyof T)[];

        await this.driver.clear();
        await this.driver.set(VERSION_KEY as keyof T, this.version as T[keyof T]);

        for (let i = 0, n = keys.length; i < n; i++) {
            notify(this.globals, this.listeners, keys[i], undefined, allData[keys[i]]);
        }
    }

    async cleanup(): Promise<void> {
        await this.ready;

        let expired: (keyof T)[] = [],
            oldValues = new Map<keyof T, T[keyof T]>();

        await this.driver.map(async (raw, key) => {
            if (key as string === VERSION_KEY) {
                return;
            }

            let deserialized = await deserialize<T[keyof T] | TTLEnvelope<T[keyof T]>>(raw, this.secret),
                unwrapped = unwrap<T[keyof T]>(deserialized);

            if (deserialized !== undefined && unwrapped.expired) {
                expired.push(key);
                oldValues.set(key, unwrapped.value);
            }
        });

        if (expired.length > 0) {
            await this.driver.delete(expired);

            for (let i = 0, n = expired.length; i < n; i++) {
                notify(this.globals, this.listeners, expired[i], undefined, oldValues.get(expired[i]));
            }
        }
    }

    async count(): Promise<number> {
        await this.ready;

        let total = await this.driver.count(),
            raw = await this.driver.get(VERSION_KEY as keyof T);

        return raw !== undefined ? total - 1 : total;
    }

    async delete(...keys: (keyof T)[]): Promise<void> {
        await this.ready;

        let oldValues = new Map<keyof T, T[keyof T] | undefined>();

        for (let i = 0, n = keys.length; i < n; i++) {
            let raw = await this.driver.get(keys[i]),
                deserialized = await deserialize<T[keyof T] | TTLEnvelope<T[keyof T]>>(raw, this.secret),
                unwrapped = unwrap<T[keyof T]>(deserialized);

            oldValues.set(keys[i], deserialized === undefined ? undefined : unwrapped.value);
        }

        await this.driver.delete(keys);

        for (let i = 0, n = keys.length; i < n; i++) {
            notify(this.globals, this.listeners, keys[i], undefined, oldValues.get(keys[i]));
        }
    }

    async filter(fn: Filter<T>): Promise<T> {
        await this.ready;

        let expired: (keyof T)[] = [],
            i = 0,
            result = {} as T,
            stop = () => { stopped = true; },
            stopped = false;

        await this.driver.map(async (raw, key) => {
            if (stopped || key as string === VERSION_KEY) {
                return;
            }

            let deserialized = await deserialize<T[keyof T] | TTLEnvelope<T[keyof T]>>(raw, this.secret),
                unwrapped = unwrap<T[keyof T]>(deserialized);

            if (deserialized === undefined) {
                return;
            }

            if (unwrapped.expired) {
                expired.push(key);
                return;
            }

            if (await fn({ i: i++, key, stop, value: unwrapped.value })) {
                result[key] = unwrapped.value;
            }
        });

        if (expired.length > 0) {
            this.driver.delete(expired);
        }

        return result;
    }

    async get(key: keyof T): Promise<T[keyof T] | undefined>;
    async get(key: keyof T, factory: () => T[keyof T] | Promise<T[keyof T]>): Promise<T[keyof T]>;
    async get(key: keyof T, factory?: () => T[keyof T] | Promise<T[keyof T]>): Promise<T[keyof T] | undefined> {
        await this.ready;

        let deserialized = await deserialize<T[keyof T] | TTLEnvelope<T[keyof T]>>(
                await this.driver.get(key),
                this.secret
            ),
            missing = false,
            unwrapped = unwrap<T[keyof T]>(deserialized);

        if (deserialized === undefined) {
            missing = true;
        }
        else if (unwrapped.expired) {
            this.driver.delete([key]);
            missing = true;
        }

        if (missing) {
            if (factory) {
                let value = await factory();

                this.set(key, value);

                return value;
            }

            return undefined;
        }

        return unwrapped.value;
    }

    async keys(): Promise<(keyof T)[]> {
        await this.ready;

        let all = await this.driver.keys();

        return all.filter((k) => k as string !== VERSION_KEY);
    }

    async length(): Promise<number> {
        await this.ready;

        return this.count();
    }

    async map(fn: (value: T[keyof T], key: keyof T, i: number) => void | Promise<void>): Promise<void> {
        await this.ready;

        let expired: (keyof T)[] = [],
            j = 0;

        await this.driver.map(async (raw, key) => {
            if (key as string === VERSION_KEY) {
                return;
            }

            let deserialized = await deserialize<T[keyof T] | TTLEnvelope<T[keyof T]>>(raw, this.secret),
                unwrapped = unwrap<T[keyof T]>(deserialized);

            if (deserialized === undefined) {
                return;
            }

            if (unwrapped.expired) {
                expired.push(key);
                return;
            }

            await fn(unwrapped.value, key, j++);
        });

        if (expired.length > 0) {
            this.driver.delete(expired);
        }
    }

    async only(...keys: (keyof T)[]): Promise<T> {
        await this.ready;

        let expired: (keyof T)[] = [],
            raw = await this.driver.only(keys),
            result = {} as T;

        for (let [key, value] of raw) {
            let deserialized = await deserialize<T[keyof T] | TTLEnvelope<T[keyof T]>>(value, this.secret),
                unwrapped = unwrap<T[keyof T]>(deserialized);

            if (deserialized === undefined) {
                continue;
            }

            if (unwrapped.expired) {
                expired.push(key);
                continue;
            }

            result[key] = unwrapped.value;
        }

        if (expired.length > 0) {
            this.driver.delete(expired);
        }

        return result;
    }

    async persist(key: keyof T): Promise<boolean> {
        await this.ready;

        let raw = await this.driver.get(key),
            deserialized = await deserialize<T[keyof T] | TTLEnvelope<T[keyof T]>>(raw, this.secret);

        if (deserialized === undefined) {
            return false;
        }

        let unwrapped = unwrap<T[keyof T]>(deserialized);

        if (unwrapped.expired) {
            this.driver.delete([key]);
            return false;
        }

        if (!unwrapped.hasTTL) {
            return true;
        }

        return this.driver.set(
            key,
            await serialize(unwrapped.value, this.secret) as T[keyof T]
        );
    }

    async replace(values: Partial<T>): Promise<string[]> {
        await this.ready;

        let entries: [keyof T, unknown][] = [],
            failed: string[] = [],
            oldValues = new Map<keyof T, T[keyof T] | undefined>();

        for (let key in values) {
            let raw = await this.driver.get(key),
                deserialized = await deserialize<T[keyof T] | TTLEnvelope<T[keyof T]>>(raw, this.secret),
                unwrapped = unwrap<T[keyof T]>(deserialized);

            oldValues.set(key, deserialized === undefined ? undefined : unwrapped.value);

            try {
                entries.push([
                    key,
                    await serialize(values[key], this.secret)
                ]);
            }
            catch {
                failed.push(key);
            }
        }

        if (entries.length > 0) {
            await this.driver.replace(entries as [keyof T, T[keyof T]][]);
        }

        for (let i = 0, n = entries.length; i < n; i++) {
            let key = entries[i][0];

            notify(this.globals, this.listeners, key, values[key] as T[keyof T], oldValues.get(key));
        }

        return failed;
    }

    async set(key: keyof T, value: T[keyof T], options?: SetOptions): Promise<boolean> {
        await this.ready;

        try {
            let oldRaw = await this.driver.get(key),
                oldDeserialized = await deserialize<T[keyof T] | TTLEnvelope<T[keyof T]>>(oldRaw, this.secret),
                oldUnwrapped = unwrap<T[keyof T]>(oldDeserialized),
                oldValue = oldDeserialized === undefined ? undefined : oldUnwrapped.value,
                stored: T[keyof T] | string;

            if (options?.ttl != null && options.ttl > 0) {
                let envelope: TTLEnvelope<T[keyof T]> = {
                    __e: Date.now() + options.ttl,
                    __v: value
                };

                stored = await serialize(envelope, this.secret) as T[keyof T];
            }
            else {
                stored = await serialize(value, this.secret) as T[keyof T];
            }

            let result = await this.driver.set(key, stored as T[keyof T]);

            notify(this.globals, this.listeners, key, value, oldValue);

            return result;
        }
        catch {
            return false;
        }
    }

    subscribe(callback: GlobalCallback<T>): () => void;
    subscribe<K extends keyof T>(key: K, callback: KeyCallback<T, K>): () => void;
    subscribe<K extends keyof T>(keyOrCallback: K | GlobalCallback<T>, callback?: KeyCallback<T, K>): () => void {
        if (typeof keyOrCallback === 'function') {
            let cb = keyOrCallback as GlobalCallback<T>;

            this.globals.add(cb);

            return () => { this.globals.delete(cb); };
        }

        let cb = callback as KeyCallback<T, K>,
            key = keyOrCallback as K,
            set = this.listeners.get(key);

        if (!set) {
            set = new Set();
            this.listeners.set(key, set);
        }

        set.add(cb as KeyCallback<T>);

        return () => { set.delete(cb as KeyCallback<T>); };
    }

    async ttl(key: keyof T): Promise<number> {
        await this.ready;

        let raw = await this.driver.get(key),
            deserialized = await deserialize<T[keyof T] | TTLEnvelope<T[keyof T]>>(raw, this.secret);

        if (deserialized === undefined) {
            return -1;
        }

        if (!isEnvelope(deserialized)) {
            return -1;
        }

        let remaining = deserialized.__e - Date.now();

        if (remaining <= 0) {
            this.driver.delete([key]);
            return -1;
        }

        return remaining;
    }
}


export default <T>(options: Options, secret?: string) => {
    return new Local<T>(options, secret);
};
export { DriverType } from './constants';
export type { Local };
