import type { Options } from './types';
import dot from '@esportsplus/dot';
import localforage from 'localforage';


let cache: any = {},
    driver: any = localforage.LOCALSTORAGE;


function init(options: Options = {}): void {
    localforage.config(Object.assign({ name: 'store' }, options, { driver }));
}


const clear = () => {
    cache = {};
    localforage.clear();
};

const del = (key: string): void => {
    dot.set(cache, key, undefined);
    localforage.removeItem(key);
}

const get = async (key: string, fallback: any = null): Promise<any> => {
    if (dot.has(cache, key)) {
        return dot.get(cache, key);
    }

    let root: any = `${key}`.split('.')[0],
        value: any = await localforage.getItem(root);

    if (value === null && typeof fallback === 'function' ) {
        value = await fallback();
    }

    set(root, value);

    value = dot.get(cache, key);

    if (value === null) {
        throw new Error(`'${key}' has not been set in storage`);
    }

    return value;
};

const has = async (key: string): Promise<boolean> => {
    return dot.has(cache, key) || (await localforage.getItem(key)) === null;
};

const set = (key: string, value: any): void => {
    dot.set(cache, key, value);
    localforage.setItem(key, value);
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


export default { clear, delete: del, get, has, set, useIndexedDB, useLocalStorage, useOptions };
