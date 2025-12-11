type Filter<T> = (data: { i: number; key: keyof T; stop: VoidFunction; value: T[keyof T] }) => boolean | Promise<boolean>;

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

interface DriverOptions {
    name: string;
    storeName?: string;
    version?: number;
}


export type { Driver, DriverOptions, Filter };
