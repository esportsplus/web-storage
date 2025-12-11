import type { Driver } from '~/types';


class LocalStorageDriver<T> implements Driver<T> {

    private prefix: string;


    constructor(name: string, version: number) {
        this.prefix = `${name}:${version}:`;
    }


    private getKeys(): string[] {
        let keys: string[] = [];

        for (let i = 0, n = localStorage.length; i < n; i++) {
            let key = localStorage.key(i);

            if (key && key.startsWith(this.prefix)) {
                keys.push(key.slice(this.prefix.length));
            }
        }

        return keys;
    }

    private key(key: keyof T): string {
        return this.prefix + String(key);
    }

    private parse(value: string | null): unknown {
        if (value === null) {
            return undefined;
        }

        try {
            return JSON.parse(value);
        }
        catch {
            return undefined;
        }
    }


    async all(): Promise<T> {
        let keys = this.getKeys(),
            result = {} as T;

        for (let i = 0, n = keys.length; i < n; i++) {
            let value = this.parse(localStorage.getItem(this.prefix + keys[i]));

            if (value !== undefined) {
                result[keys[i] as keyof T] = value as T[keyof T];
            }
        }

        return result;
    }

    async clear(): Promise<void> {
        let keys = this.getKeys();

        for (let i = 0, n = keys.length; i < n; i++) {
            localStorage.removeItem(this.prefix + keys[i]);
        }
    }

    async count(): Promise<number> {
        return this.getKeys().length;
    }

    async delete(keys: (keyof T)[]): Promise<void> {
        for (let i = 0, n = keys.length; i < n; i++) {
            localStorage.removeItem(this.key(keys[i]));
        }
    }

    async get(key: keyof T): Promise<T[keyof T] | undefined> {
        return this.parse(localStorage.getItem(this.key(key))) as T[keyof T] | undefined;
    }

    async keys(): Promise<(keyof T)[]> {
        return this.getKeys() as (keyof T)[];
    }

    async map(fn: (value: T[keyof T], key: keyof T, i: number) => void | Promise<void>): Promise<void> {
        let keys = this.getKeys();

        for (let i = 0, n = keys.length; i < n; i++) {
            let value = this.parse(localStorage.getItem(this.prefix + keys[i]));

            if (value !== undefined) {
                await fn(value as T[keyof T], keys[i] as keyof T, i);
            }
        }
    }

    async only(keys: (keyof T)[]): Promise<Map<keyof T, T[keyof T]>> {
        let results = new Map<keyof T, T[keyof T]>();

        for (let i = 0, n = keys.length; i < n; i++) {
            let value = this.parse(localStorage.getItem(this.key(keys[i])));

            if (value !== undefined) {
                results.set(keys[i], value as T[keyof T]);
            }
        }

        return results;
    }

    async replace(entries: [keyof T, T[keyof T]][]): Promise<void> {
        for (let i = 0, n = entries.length; i < n; i++) {
            localStorage.setItem(this.key(entries[i][0]), JSON.stringify(entries[i][1]));
        }
    }

    async set(key: keyof T, value: T[keyof T]): Promise<boolean> {
        try {
            localStorage.setItem(this.key(key), JSON.stringify(value));
            return true;
        }
        catch {
            return false;
        }
    }
}


export { LocalStorageDriver };
