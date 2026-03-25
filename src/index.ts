import { decrypt, encrypt } from '@esportsplus/utilities';
import type { Driver, Filter, Options, SetOptions, TTLEnvelope } from './types';
import { DriverType } from './constants';
import { IndexedDBDriver } from '~/drivers/indexeddb';
import { LocalStorageDriver } from '~/drivers/localstorage';


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


class Local<T> {

    private driver: Driver<T>;

    private secret: string | null;


    constructor(options: Options, secret?: string) {
        this.secret = secret || null;

        let { name, version = 1 } = options;

        if (options.driver === DriverType.LocalStorage) {
            this.driver = new LocalStorageDriver<T>(name, version);
        }
        else {
            this.driver = new IndexedDBDriver<T>(name, version);
        }
    }


    async all(): Promise<T> {
        let expired: (keyof T)[] = [],
            raw = await this.driver.all(),
            result = {} as T;

        for (let key in raw) {
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
        return this.driver.clear();
    }

    async cleanup(): Promise<void> {
        let expired: (keyof T)[] = [];

        await this.driver.map(async (raw, key) => {
            let deserialized = await deserialize<T[keyof T] | TTLEnvelope<T[keyof T]>>(raw, this.secret);

            if (deserialized !== undefined && unwrap(deserialized).expired) {
                expired.push(key);
            }
        });

        if (expired.length > 0) {
            await this.driver.delete(expired);
        }
    }

    async count(): Promise<number> {
        return this.driver.count();
    }

    async delete(...keys: (keyof T)[]): Promise<void> {
        return this.driver.delete(keys);
    }

    async filter(fn: Filter<T>): Promise<T> {
        let expired: (keyof T)[] = [],
            i = 0,
            result = {} as T,
            stop = () => { stopped = true; },
            stopped = false;

        await this.driver.map(async (raw, key) => {
            if (stopped) {
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

    async get(key: keyof T): Promise<T[keyof T] | undefined> {
        let deserialized = await deserialize<T[keyof T] | TTLEnvelope<T[keyof T]>>(
                await this.driver.get(key),
                this.secret
            ),
            unwrapped = unwrap<T[keyof T]>(deserialized);

        if (deserialized === undefined) {
            return undefined;
        }

        if (unwrapped.expired) {
            this.driver.delete([key]);
            return undefined;
        }

        return unwrapped.value;
    }

    async keys(): Promise<(keyof T)[]> {
        return this.driver.keys();
    }

    length(): Promise<number> {
        return this.driver.count();
    }

    map(fn: (value: T[keyof T], key: keyof T, i: number) => void | Promise<void>): Promise<void> {
        let expired: (keyof T)[] = [],
            j = 0,
            promise = this.driver.map(async (raw, key) => {
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

        return promise.then(() => {
            if (expired.length > 0) {
                this.driver.delete(expired);
            }
        });
    }

    async only(...keys: (keyof T)[]): Promise<T> {
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
        let entries: [keyof T, unknown][] = [],
            failed: string[] = [];

        for (let key in values) {
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

        return failed;
    }

    async set(key: keyof T, value: T[keyof T], options?: SetOptions): Promise<boolean> {
        try {
            let stored: T[keyof T] | string;

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

            return this.driver.set(key, stored as T[keyof T]);
        }
        catch {
            return false;
        }
    }

    async ttl(key: keyof T): Promise<number> {
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
