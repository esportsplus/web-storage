import { WebStorageDriver } from '~/drivers/webstorage';


class SessionStorageDriver<T> extends WebStorageDriver<T> {

    constructor(name: string, version: number) {
        super(sessionStorage, name, version);
    }
}


export { SessionStorageDriver };
