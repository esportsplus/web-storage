import type { Options } from './types';
import dot from '@esportsplus/dot';
import localforage from 'localforage';


let cache: any = {},
    driver: any = localforage.LOCALSTORAGE;


function init(options: Options = {}): void {
    localforage.config(Object.assign({ name: 'store' }, options, { driver }));
}

function sync(key: string) {
    let root = (key.split('.')[0] || '');

    localforage.setItem(root, dot.get(cache, root));
}


const clear = () => {
    cache = {};
    localforage.clear();
};

const del = (key: string): void => {
    dot.set(cache, key, undefined);

    if (key.includes('.')) {
        sync(key);
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

    let value: any = await localforage.getItem(key.split('.')[0] || '');

    if (value !== null) {
        set(key, value);
    }

    return value !== null;
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

const set = (key: string, value: any): void => {
    dot.set(cache, key, value);
    sync(key);
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
