import { compress, decompress } from '~/lz';
import type { Driver } from '~/types';


class SessionStorageDriver<T> implements Driver<T> {

    private prefix: string;


    constructor(name: string, version: number) {
        this.prefix = `${name}:${version}:`;
    }


    private getKeys(): string[] {
        let keys: string[] = [];

        for (let i = 0, n = sessionStorage.length; i < n; i++) {
            let key = sessionStorage.key(i);

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
            if (value.charCodeAt(0) === 1) {
                return JSON.parse(decompress(value.slice(1)));
            }

            return JSON.parse(value);
        }
        catch {
            return undefined;
        }
    }

    private serialize(value: T[keyof T]): string {
        let json = JSON.stringify(value);

        return json.length >= 100 ? '\x01' + compress(json) : json;
    }


    async all(): Promise<T> {
        let keys = this.getKeys(),
            result = {} as T;

        for (let i = 0, n = keys.length; i < n; i++) {
            let value = this.parse(sessionStorage.getItem(this.prefix + keys[i]));

            if (value !== undefined) {
                result[keys[i] as keyof T] = value as T[keyof T];
            }
        }

        return result;
    }

    async clear(): Promise<void> {
        let keys = this.getKeys();

        for (let i = 0, n = keys.length; i < n; i++) {
            sessionStorage.removeItem(this.prefix + keys[i]);
        }
    }

    async count(): Promise<number> {
        let count = 0;

        for (let i = 0, n = sessionStorage.length; i < n; i++) {
            if (sessionStorage.key(i)?.startsWith(this.prefix)) {
                count++;
            }
        }

        return count;
    }

    async delete(keys: (keyof T)[]): Promise<void> {
        for (let i = 0, n = keys.length; i < n; i++) {
            sessionStorage.removeItem(this.key(keys[i]));
        }
    }

    async get(key: keyof T): Promise<T[keyof T] | undefined> {
        return this.parse(sessionStorage.getItem(this.key(key))) as T[keyof T] | undefined;
    }

    async keys(): Promise<(keyof T)[]> {
        return this.getKeys() as (keyof T)[];
    }

    async map(fn: (value: T[keyof T], key: keyof T, i: number) => void | Promise<void>): Promise<void> {
        let keys = this.getKeys();

        for (let i = 0, n = keys.length; i < n; i++) {
            let value = this.parse(sessionStorage.getItem(this.prefix + keys[i]));

            if (value !== undefined) {
                await fn(value as T[keyof T], keys[i] as keyof T, i);
            }
        }
    }

    async only(keys: (keyof T)[]): Promise<Map<keyof T, T[keyof T]>> {
        let results = new Map<keyof T, T[keyof T]>();

        for (let i = 0, n = keys.length; i < n; i++) {
            let value = this.parse(sessionStorage.getItem(this.key(keys[i])));

            if (value !== undefined) {
                results.set(keys[i], value as T[keyof T]);
            }
        }

        return results;
    }

    async replace(entries: [keyof T, T[keyof T]][]): Promise<void> {
        for (let i = 0, n = entries.length; i < n; i++) {
            sessionStorage.setItem(this.key(entries[i][0]), this.serialize(entries[i][1]));
        }
    }

    async set(key: keyof T, value: T[keyof T]): Promise<boolean> {
        try {
            sessionStorage.setItem(this.key(key), this.serialize(value));
            return true;
        }
        catch {
            return false;
        }
    }
}


export { SessionStorageDriver };
