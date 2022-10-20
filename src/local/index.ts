import { Driver, Object } from './types';
import localforage from 'localforage';


class Store {
    instance: LocalForage;
    iterate: LocalForage['iterate'];
    keys: LocalForage['keys'];
    length: LocalForage['length'];


    constructor(options: LocalForageOptions = {}) {
        let driver,
            name = options.name || 'store';

        switch ((options.driver || Driver.IndexedDB) as Driver) {
            case Driver.LocalStorage:
                driver = localforage.LOCALSTORAGE;
                break;
            default:
                driver = localforage.INDEXEDDB;
                break;
        }

        this.instance = localforage.createInstance(
            Object.assign(options, { driver, name, storeName: name })
        );
        this.iterate = this.instance.iterate;
        this.keys = this.instance.keys;
        this.length = this.instance.length;
    }


    async all(): Promise<Object> {
        let values: Object = {};

        await this.instance.iterate((value: any, key: string) => {
            values[key] = value;
        });

        return values;
    }

    async clear(): Promise<void> {
        await this.instance.clear();
    }

    async delete(...keys: string[]): Promise<void> {
        if (!keys.length) {
            return;
        }

        for (let i = 0, n = keys.length; i < n; i++) {
            await this.instance.removeItem(keys[i]);
        }
    }

    async filter(filter: Function): Promise<Object> {
        let s: () => void = () => {
                stop = true;
            },
            stop: boolean = false,
            values: Object = {};

        await this.instance.iterate((value: any, key: string, i: number) => {
            if (filter({ i, key, stop: s, value })) {
                values[key] = value;
            }

            // LocalForage iterate will stop once a non
            // undefined value is returned
            if (stop) {
                return true;
            }
        });

        return values;
    }

    async get(...keys: string[]): Promise<any> {
        if (keys.length === 1) {
            return await this.instance.getItem(keys[0]);
        }

        return await this.filter((key: string) => keys.includes(key));
    }

    async has(...keys: string[]): Promise<boolean> {
        let haystack = await this.instance.keys();

        for (let i = 0, n = keys.length; i < n; i++) {
            if (haystack.includes(keys[i])) {
                continue;
            }

            return false;
        }

        return true;
    }

    async set(values: { [key: string]: any }): Promise<void> {
        if (!Object.keys(values).length) {
            return;
        }

        for (let key in values) {
            await this.instance.setItem(key, values[key]);
        }
    }
}


export default {
    store: (options: LocalForageOptions = {}): Store => new Store(options)
};
