import type { Driver } from '~/types';


class MemoryDriver<T> implements Driver<T> {

    private store: Map<keyof T, T[keyof T]>;


    constructor(_name: string, _version: number) {
        this.store = new Map();
    }


    async all(): Promise<T> {
        let result = {} as T;

        for (let [key, value] of this.store) {
            result[key] = value;
        }

        return result;
    }

    async clear(): Promise<void> {
        this.store.clear();
    }

    async count(): Promise<number> {
        return this.store.size;
    }

    async delete(keys: (keyof T)[]): Promise<void> {
        for (let i = 0, n = keys.length; i < n; i++) {
            this.store.delete(keys[i]);
        }
    }

    async get(key: keyof T): Promise<T[keyof T] | undefined> {
        return this.store.get(key);
    }

    async keys(): Promise<(keyof T)[]> {
        return [...this.store.keys()];
    }

    async map(fn: (value: T[keyof T], key: keyof T, i: number) => void | Promise<void>): Promise<void> {
        let i = 0;

        for (let [key, value] of this.store) {
            await fn(value, key, i++);
        }
    }

    async only(keys: (keyof T)[]): Promise<Map<keyof T, T[keyof T]>> {
        let results = new Map<keyof T, T[keyof T]>();

        for (let i = 0, n = keys.length; i < n; i++) {
            let value = this.store.get(keys[i]);

            if (value !== undefined) {
                results.set(keys[i], value);
            }
        }

        return results;
    }

    async replace(entries: [keyof T, T[keyof T]][]): Promise<void> {
        for (let i = 0, n = entries.length; i < n; i++) {
            this.store.set(entries[i][0], entries[i][1]);
        }
    }

    async set(key: keyof T, value: T[keyof T]): Promise<boolean> {
        this.store.set(key, value);
        return true;
    }
}


export { MemoryDriver };
