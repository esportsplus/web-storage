enum Driver {
    IndexedDB,
    LocalStorage
};

type Options = LocalForageOptions & { name: string };


export { Driver, Options };
