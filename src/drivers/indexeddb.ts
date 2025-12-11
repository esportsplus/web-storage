import type { Driver, DriverOptions } from './types';


let connections = new Map<string, Promise<IDBDatabase>>();


function connect(name: string, storeName: string, version: number): Promise<IDBDatabase> {
    let key = `${name}:${storeName}:${version}`;

    if (!connections.has(key)) {
        connections.set(key, new Promise((resolve, reject) => {
            let request = indexedDB.open(name, version);

            request.onupgradeneeded = () => {
                let db = request.result;

                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName);
                }
            };

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        }));
    }

    return connections.get(key)!;
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}


class IndexedDBDriver<T> implements Driver<T> {

    private connection: Promise<IDBDatabase>;

    private storeName: string;


    constructor(options: DriverOptions) {
        this.storeName = options.storeName || options.name;
        this.connection = connect(options.name, this.storeName, options.version || 1);
    }


    async all(): Promise<T> {
        let db = await this.connection,
            store = db.transaction(this.storeName, 'readonly').objectStore(this.storeName),
            [keys, values] = await Promise.all([
                promisify(store.getAllKeys()),
                promisify(store.getAll())
            ]),
            result = {} as T;

        for (let i = 0, n = keys.length; i < n; i++) {
            result[keys[i] as keyof T] = values[i];
        }

        return result;
    }

    async clear(): Promise<void> {
        let db = await this.connection,
            store = db.transaction(this.storeName, 'readwrite').objectStore(this.storeName);

        await promisify(store.clear());
    }

    async count(): Promise<number> {
        let db = await this.connection,
            store = db.transaction(this.storeName, 'readonly').objectStore(this.storeName);

        return promisify(store.count());
    }

    async delete(keys: (keyof T)[]): Promise<void> {
        let db = await this.connection,
            tx = db.transaction(this.storeName, 'readwrite'),
            store = tx.objectStore(this.storeName);

        for (let i = 0, n = keys.length; i < n; i++) {
            store.delete(keys[i] as IDBValidKey);
        }

        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async get(key: keyof T): Promise<T[keyof T] | undefined> {
        let db = await this.connection,
            store = db.transaction(this.storeName, 'readonly').objectStore(this.storeName);

        return promisify(store.get(key as IDBValidKey));
    }

    async keys(): Promise<(keyof T)[]> {
        let db = await this.connection,
            store = db.transaction(this.storeName, 'readonly').objectStore(this.storeName);

        return promisify(store.getAllKeys()) as Promise<(keyof T)[]>;
    }

    async map(fn: (value: T[keyof T], key: keyof T, i: number) => void | Promise<void>): Promise<void> {
        let db = await this.connection,
            store = db.transaction(this.storeName, 'readonly').objectStore(this.storeName);

        return new Promise((resolve, reject) => {
            let cursor = store.openCursor(),
                i = 0;

            cursor.onerror = () => reject(cursor.error);
            cursor.onsuccess = async () => {
                let c = cursor.result;

                if (c) {
                    await fn(c.value, c.key as keyof T, i++);
                    c.continue();
                }
                else {
                    resolve();
                }
            };
        });
    }

    async only(keys: (keyof T)[]): Promise<Map<keyof T, T[keyof T]>> {
        let db = await this.connection,
            results = new Map<keyof T, T[keyof T]>(),
            tx = db.transaction(this.storeName, 'readonly'),
            store = tx.objectStore(this.storeName);

        let promises = keys.map((key) =>
            promisify(store.get(key as IDBValidKey)).then((value) => {
                if (value !== undefined) {
                    results.set(key, value);
                }
            })
        );

        await Promise.all(promises);

        return results;
    }

    async replace(entries: [keyof T, T[keyof T]][]): Promise<void> {
        let db = await this.connection,
            tx = db.transaction(this.storeName, 'readwrite'),
            store = tx.objectStore(this.storeName);

        for (let i = 0; i < entries.length; i++) {
            store.put(entries[i][1], entries[i][0] as IDBValidKey);
        }

        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async set(key: keyof T, value: T[keyof T]): Promise<boolean> {
        try {
            let db = await this.connection,
                store = db.transaction(this.storeName, 'readwrite').objectStore(this.storeName);

            await promisify(store.put(value, key as IDBValidKey));

            return true;
        }
        catch {
            return false;
        }
    }
}


export { IndexedDBDriver };
