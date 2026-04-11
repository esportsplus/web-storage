import { DriverType } from './constants';


interface Driver<T> {
    all(): Promise<T>;
    clear(): Promise<void>;
    count(): Promise<number>;
    delete(keys: (keyof T)[]): Promise<void>;
    get(key: keyof T): Promise<T[keyof T] | undefined>;
    keys(): Promise<(keyof T)[]>;
    map(fn: (value: T[keyof T], key: keyof T, i: number) => void | Promise<void>): Promise<void>;
    only(keys: (keyof T)[]): Promise<Map<keyof T, T[keyof T]>>;
    replace(entries: [keyof T, T[keyof T]][]): Promise<void>;
    set(key: keyof T, value: T[keyof T]): Promise<boolean>;
}

type Filter<T> = (data: { i: number; key: keyof T; stop: VoidFunction; value: T[keyof T] }) => boolean | Promise<boolean>;

type MigrationContext = {
    all(): Promise<Record<string, unknown>>;
};

type MigrationFn = (old: MigrationContext) => Promise<Record<string, unknown>>;

type Options = {
    driver?: DriverType.IndexedDB | DriverType.LocalStorage | DriverType.Memory | DriverType.SessionStorage;
    migrations?: Record<number, MigrationFn>;
    name: string;
    version: number;
};

type SetOptions = {
    ttl?: number;
};

type TTLEnvelope<V> = {
    __e: number;
    __v: V;
};


type GlobalCallback<T> = (key: keyof T, newValue: T[keyof T] | undefined, oldValue: T[keyof T] | undefined) => void;

type KeyCallback<T, K extends keyof T = keyof T> = (newValue: T[K] | undefined, oldValue: T[K] | undefined) => void;


export type { Driver, Filter, GlobalCallback, KeyCallback, MigrationFn, Options, SetOptions, TTLEnvelope };