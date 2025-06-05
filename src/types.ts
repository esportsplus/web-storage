import localforage from 'localforage';


enum Driver {
    IndexedDB,
    LocalStorage
};

type Filter<T> = (data: { i: number, key: keyof T, stop: VoidFunction, value: T[keyof T] }) => boolean | Promise<boolean>;

type LocalForage = typeof localforage;

type Options = {
    description?: string;
    driver?: string | string[];
    name: string;
    size?: number;
    version?: number;
};


export { Driver };
export type { Filter, LocalForage, Options };
