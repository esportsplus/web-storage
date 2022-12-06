enum Driver {
    IndexedDB,
    LocalStorage
};

type Options = {
    description?: string;
    driver?: string | string[];
    name: string;
    size?: number;
    version?: number;
};


export { Driver, Options };
