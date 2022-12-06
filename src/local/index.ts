import { Driver, LocalForage, Options } from './types';
import localforage from 'localforage';


class Store<T> {
    instance: LocalForage;
    iterate: LocalForage['iterate'];
    keys: LocalForage['keys'];
    length: LocalForage['length'];


    constructor(options: Options) {
        let driver;

        switch ((options.driver || Driver.IndexedDB) as Driver) {
            case Driver.LocalStorage:
                driver = localforage.LOCALSTORAGE;
                break;
            default:
                driver = localforage.INDEXEDDB;
                break;
        }

        this.instance = localforage.createInstance(
            Object.assign(options, { driver, storeName: options.name })
        );
        this.iterate = this.instance.iterate;
        this.keys = this.instance.keys;
        this.length = this.instance.length;
    }


    async all(): Promise<T | Record<string, never>> {
        let values: T = {} as T;

        await this.instance.iterate((value: any, key: string) => {
            values[key as keyof T] = value;
        });

        return values;
    }

    async clear() {
        await this.instance.clear();
    }

    async delete(...keys: (keyof T)[]) {
        if (!keys.length) {
            return;
        }

        for (let i = 0, n = keys.length; i < n; i++) {
            await this.instance.removeItem(keys[i] as string);
        }
    }

    async filter(filter: Function): Promise<T | Record<string, never>> {
        let s: VoidFunction = () => {
                stop = true;
            },
            stop: boolean = false,
            values: T = {} as T;

        await this.instance.iterate((value: any, key: string, i: number) => {
            if (filter({ i, key, stop: s, value })) {
                values[key as keyof T] = value;
            }

            // LocalForage iterate will stop once a non
            // undefined value is returned
            if (stop) {
                return true;
            }
        });

        return values;
    }

    async get(key: keyof T) {
        let value: T[keyof T] | null = await this.instance.getItem(key as string);

        if (value === null) {
            return undefined;
        }

        return value;
    }

    async only(...keys: (keyof T)[]) {
        return await this.filter((key: string) => keys.includes(key as keyof T));
    }

    async replace(values: T) {
        for (let key in values) {
            await this.instance.setItem(key, values[key]);
        }
    }

    async set(key: keyof T, value: T[keyof T]) {
        await this.instance.setItem(key as string, value);
    }
}


export default {
    store: <T>(options: Options) => new Store<T>(options)
};
