import { WebStorageDriver } from '~/drivers/webstorage';


class LocalStorageDriver<T> extends WebStorageDriver<T> {

    constructor(name: string, version: number) {
        super(localStorage, name, version);
    }
}


export { LocalStorageDriver };
