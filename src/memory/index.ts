class Store<T extends object> {
    defaults: T;
    store: T;


    constructor(defaults: T) {
        this.defaults = defaults;
        this.store = this.defaults;
    }


    all() {
        return Object.assign({}, this.store);
    }

    clear() {
        this.store = this.defaults;
    }

    delete(key: keyof T) {
        delete this.store[key];
    }

    async filter(filter: Function): Promise<T | {}> {
        let s: () => void = () => {
                stop = true;
            },
            stop: boolean = false,
            values: T = {} as T;

        for (let key in this.store) {
            let value = this.store[key];

            if (await filter({ key, stop: s, value })) {
                values[key as keyof T] = value;
            }

            if (stop) {
                break;
            }
        }

        return values;
    }

    get(key: keyof T) {
        return this.store[key];
    }

    only(...keys: (keyof T)[]) {
        let data: any = {};

        for (let i = 0, n = keys.length; i < n; i++) {
            data[keys[i]] = this.store[keys[i]];
        }

        return data;
    }

    replace(values: T) {
        for (let key in values) {
            this.store[key as keyof T] = values[key];
        }
    }

    set(key: keyof T, value: T[keyof T]) {
        this.store[key] = value;
    }
}


export default {
    store: <T extends object>(data: T | {} = {}) => new Store(data)
};