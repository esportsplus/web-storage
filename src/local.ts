import { Driver, Filter, LocalForage, Options } from '~/types';
import { decrypt, encrypt } from '@esportsplus/crypto';
import localforage from 'localforage';


async function deserialize(value: unknown, secret: null | string = null) {
    if (secret && typeof value === 'string') {
        value = await decrypt(value, secret);
    }

    if (typeof value === 'string') {
        value = JSON.parse(value);
    }

    return value;
}

async function serialize(value: unknown, secret: null | string = null) {
    if (value === null || value === undefined) {
        return undefined;
    }

    value = JSON.stringify(value);

    if (secret) {
        value = await encrypt(value as string, secret);
    }

    return value as string;
}


class Local<T> {
    instance: LocalForage;
    iterate: LocalForage['iterate'];
    keys: LocalForage['keys'];
    length: LocalForage['length'];
    secret: null | string = null;


    constructor(options: Options, secret?: string) {
        switch ((options.driver || Driver.IndexedDB) as Driver) {
            case Driver.LocalStorage:
                options.driver = localforage.LOCALSTORAGE;
                break;
            default:
                options.driver = localforage.INDEXEDDB;
                break;
        }

        this.instance = localforage.createInstance(
            Object.assign(options, { storeName: options.name })
        );
        this.iterate = this.instance.iterate;
        this.keys = this.instance.keys;
        this.length = this.instance.length;

        if (secret) {
            this.secret = secret;
        }
    }


    async all(): Promise<T> {
        let stack: Promise<void>[] = [],
            values: T = {} as T;

        await this.instance.iterate((v: unknown, k: string) => {
            stack.push(
                deserialize(v, this.secret)
                    .then((value) => {
                        if (value === undefined) {
                            return;
                        }

                        values[k as keyof T] = value as T[keyof T];
                    })
                    .catch(() => {})
            )
        });

        await Promise.allSettled(stack);

        return values;
    }

    async clear() {
        await this.instance.clear();
    }

    async delete(...keys: (keyof T)[]) {
        let stack: Promise<void>[] = [];

        for (let i = 0, n = keys.length; i < n; i++) {
            stack.push( this.instance.removeItem(keys[i] as string) );
        }

        await Promise.allSettled(stack);
    }

    async filter(fn: Filter<T>): Promise<T> {
        let stop: VoidFunction = () => {
                stopped = true;
            },
            stopped: boolean = false,
            values: T = {} as T;

        await this.instance.iterate(async (v, k, i) => {
            let key = k as keyof T,
                value = await deserialize(v, this.secret).catch(() => undefined) as T[keyof T];

            if (value === undefined) {
                return;
            }

            if (await fn({ i, key, stop, value })) {
                values[key] = value;
            }

            // LocalForage iterate will stop once a non
            // undefined value is returned
            if (stopped) {
                return true;
            }
        });

        return values;
    }

    async get(key: keyof T) {
        return await deserialize( await this.instance.getItem(key as string), this.secret ).catch(() => undefined);
    }

    async only(...keys: (keyof T)[]) {
        return await this.filter( ({ key }) => keys.includes(key) );
    }

    async replace(values: T) {
        let failed: string[] = [],
            stack: Promise<void>[] = [];

        for (let key in values) {
            stack.push(
                this.set(key, values[key])
                    .then((ok) => {
                        if (ok) {
                            return;
                        }

                        failed.push(key);
                    })
            );
        }

        await Promise.allSettled(stack);

        return failed;
    }

    async set(key: keyof T, value: T[keyof T]) {
        let ok = true;

        await this.instance.setItem(
            key as string,
            await serialize(value, this.secret)
                .catch(() => {
                    ok = false;
                    return undefined;
                })
        );

        return ok;
    }
}


export default <T>(options: Options, secret?: string) => new Local<T>(options, secret);