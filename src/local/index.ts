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


    async assign(key: string, value: Object): Promise<void> {
        let data = (await this.get(key)) || {};
            
        await this.instance.setItem(
            key, 
            Object.assign(data, value)
        );
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

    async entries(): Promise<Object> {
        let values: Object = {};

        await this.instance.iterate((value: any, key: string) => (values[key] = value));

        return values;
    }

    async filter(fn: Function): Promise<Object> {
        let values: Object = {};

        await this.instance.iterate((value: any, key: string) => {
            let result = fn(value, key),
                stop = typeof result !== 'boolean';

            if (stop || (!stop && result)) {
                values[key] = value;
            }

            if (stop) {
                return true;
            }
        });

        return values;
    }

    async get(key: string, value: any = null): Promise<any> {
        let data: any = await this.instance.getItem(key);
    
        if (data === null) {
            if (typeof value === 'function') {
                data = await value();
            }
            else {
                data = value;
            }
    
            if (data !== null) {
                this.set(key, data);
            }
        }
    
        if (data === null) {
            throw new Error(`'${key}' has not been set in Storage`);
        }
    
        return data;
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

    async only(...keys: string[]): Promise<Object> {
        return await this.filter((key: string) => keys.includes(key));
    }

    async pop(key: string): Promise<any> {
        let value,
            values = (await this.get(key)) || [];

        value = values.pop();

        await this.instance.setItem(key, values);

        return value;
    }

    async push(key: string, ...values: any[]): Promise<void> {
        if (!values.length) {
            return;
        }

        let data = (await this.get(key)) || []; 

        data.push(...values);

        await this.instance.setItem(key, data);
    }

   async replace(values: { [key: string]: any }): Promise<void> {
        if (!Object.keys(values).length) {
            return;
        }

        for (let key in values) {
            await this.instance.setItem(key, values[key]);
        }
    }

    async shift(key: string): Promise<any> {
        let value,
            values = (await this.get(key)) || [];

        value = values.shift();

        await this.instance.setItem(key, values);

        return value;
    }

    async set(key: string, value: any): Promise<void> {
        await this.instance.setItem(key, value);
    }

    async unshift(key: string, ...values: any[]): Promise<void> {
        if (!values.length) {
            return;
        }

        let data = (await this.get(key)) || [];

        data.unshift(...values);

        await this.instance.setItem(key, data);
    }
}


export default {
    store: (options: LocalForageOptions = {}): Store => new Store(options)
};
