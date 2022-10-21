enum Driver {
    IndexedDB,
    LocalStorage
};

type Object = { [key: string]: any };

type Options = LocalForageOptions & { name: string };


export { Driver, Object, Options };
