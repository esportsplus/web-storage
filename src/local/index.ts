import type { Options } from './types';
import dot from '@esportsplus/dot';
import localforage from 'localforage';


let cache: any = {},
    driver: any = localforage.LOCALSTORAGE;


function init(options: Options = {}): void {
    localforage.config(Object.assign({ name: 'store' }, options, { driver }));
}

async function sync(key: string) {
    let root = (key.split('.')[0] || '');

    await localforage.setItem(root, dot.get(cache, root));
}


const clear = () => {
    cache = {};
    localforage.clear();
};

const del = async (key: string): Promise<void> => {
    dot.set(cache, key, undefined);

    if (key.includes('.')) {
        await sync(key);
    }
    else {
        localforage.removeItem(key);
    }
}

const get = async (key: string, value: any = null): Promise<any> => {
    if (await has(key)) {
        return dot.get(cache, key);
    }

    if (typeof value === 'function') {
        value = await value();
    }

    set(key, value);

    value = dot.get(cache, key);

    if (value === null) {
        throw new Error(`'${key}' has not been set in storage`);
    }

    return value;
};

const has = async (key: string): Promise<boolean> => {
    if (dot.has(cache, key)) {
        return true;
    }

    let k = key.split('.'),
        f = k.shift() || '',
        value = await localforage.getItem(f);

    if (value !== null) {
        set(f, value);

        if (Array.isArray(value) && k.length == 0) {
            return true;
        }

        if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
            return dot.has(value, k.join('.'));
        }
    }

    return false;
};

const prepend = async (key: string, value: any): Promise<void> => {
    let values = await get(key, []);

    if (!Array.isArray(values)) {
        values = [values];
    }

    values.unshift(value);

    set(key, values);
};

const push = async (key: string, value: any): Promise<void> => {
    let values = await get(key, []);

    if (!Array.isArray(values)) {
        values = [values];
    }

    values.push(value);

    set(key, values);
};

const replace = (values: { [key: string]: any }): void => {
    for (let key in values) {
        set(key, values[key]);
    }
};

const set = async (key: string, value: any): Promise<void> => {
    dot.set(cache, key, value);
    await sync(key);
};

const useIndexedDB = (options: Options = {}): void => {
    driver = localforage.INDEXEDDB;
    init(options);
};

const useLocalStorage = (options: Options = {}): void => {
    driver = localforage.LOCALSTORAGE;
    init(options);
};

const useOptions = (options: Options = {}): void => {
    init(options);
};


// Initialize using localstorage as default storage
init();


export default { clear, delete: del, get, has, prepend, push, replace, set, useIndexedDB, useLocalStorage, useOptions };
