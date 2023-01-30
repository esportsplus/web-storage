import localforage from 'localforage';


enum Driver {
    IndexedDB,
    LocalStorage
};

type LocalForage = typeof localforage;

type Options = {
    description?: string;
    driver?: string | string[];
    name: string;
    size?: number;
    version?: number;
};


export { Driver, LocalForage, Options };
