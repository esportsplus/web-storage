import type { Options } from './types';
import dot from '@esportsplus/dot';
import localforage from 'localforage';


let cache: any = {},
    driver: any = localforage.LOCALSTORAGE;


function init(options: Options = {}): void {
    localforage.config(Object.assign({ name: 'store' }, options, { driver }));
}

function sync(key: string) {
    localforage.setItem(key.split('.')[0], dot.get(cache, key));
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

const get = async (key: string, fallback: any = null): Promise<any> => {
    if (has(key)) {
        return dot.get(cache, key);
    }

    if (typeof fallback === 'function') {
        set(key, await fallback());
    }

    let value = dot.get(cache, key);

    if (value === null) {
        throw new Error(`'${key}' has not been set in storage`);
    }

    return value;
};

const has = async (key: string): Promise<boolean> => {
    if (dot.has(cache, key)) {
        return true;
    }

    let value: any = await localforage.getItem(key.split('.')[0]);

    if (value !== null) {
        set(key, value);
    }

    return value !== null;
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


export default { clear, delete: del, get, has, set, useIndexedDB, useLocalStorage, useOptions };
