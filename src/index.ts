import { decrypt, encrypt } from '@esportsplus/crypto';
import type { Driver, Filter, Options } from './types';
import { DriverType } from './constants';
import { IndexedDBDriver } from '~/drivers/indexeddb';
import { LocalStorageDriver } from '~/drivers/localstorage';


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
        let raw = await this.driver.all(),
            result = {} as T;

        for (let key in raw) {
            let value = await deserialize<T[keyof T]>(raw[key], this.secret);

            if (value !== undefined) {
                (result as Record<string, unknown>)[key] = value;
            }
        }

        return result;
    }

    async clear(): Promise<void> {
        return this.driver.clear();
    }

    async count(): Promise<number> {
        return this.driver.count();
    }

    async delete(...keys: (keyof T)[]): Promise<void> {
        return this.driver.delete(keys);
    }

    async filter(fn: Filter<T>): Promise<T> {
        let i = 0,
            result = {} as T,
            stop = () => { stopped = true; },
            stopped = false;

        await this.driver.map(async (raw, key) => {
            if (stopped) {
                return;
            }

            let value = await deserialize<T[keyof T]>(raw, this.secret);

            if (value === undefined) {
                return;
            }

            if (await fn({ i: i++, key, stop, value })) {
                result[key] = value;
            }
        });

        return result;
    }

    async get(key: keyof T): Promise<T[keyof T] | undefined> {
        return deserialize<T[keyof T]>(
            await this.driver.get(key),
            this.secret
        );
    }

    async keys(): Promise<(keyof T)[]> {
        return this.driver.keys();
    }

    length(): Promise<number> {
        return this.driver.count();
    }

    map(fn: (value: T[keyof T], key: keyof T, i: number) => void | Promise<void>): Promise<void> {
        return this.driver.map(async (raw, key, i) => {
            let value = await deserialize<T[keyof T]>(raw, this.secret);

            if (value !== undefined) {
                await fn(value, key, i);
            }
        });
    }

    async only(...keys: (keyof T)[]): Promise<T> {
        let raw = await this.driver.only(keys),
            result = {} as T;

        for (let [key, value] of raw) {
            let deserialized = await deserialize<T[keyof T]>(value, this.secret);

            if (deserialized !== undefined) {
                result[key] = deserialized;
            }
        }

        return result;
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

    async set(key: keyof T, value: T[keyof T]): Promise<boolean> {
        try {
            return this.driver.set(
                key,
                await serialize(value, this.secret) as T[keyof T]
            );
        }
        catch {
            return false;
        }
    }
}


export default <T>(options: Options, secret?: string) => {
    return new Local<T>(options, secret);
};
export { DriverType } from './constants';