import 'fake-indexeddb/auto';

import { describe, expect, it } from 'vitest';

import { IndexedDBDriver } from '~/drivers/indexeddb';


type TestData = { age: number; name: string; tags: string[] };


let id = 0;

function uid() {
    return `test-db-${++id}`;
}


describe('IndexedDBDriver', () => {

    describe('all', () => {
        it('returns all stored key-value pairs', async () => {
            let db = uid(),
                driver = new IndexedDBDriver<TestData>(db, 1);

            await driver.set('name', 'alice');
            await driver.set('age', 30);

            let result = await driver.all();

            expect(result).toEqual({ age: 30, name: 'alice' });
        });

        it('returns empty object when storage is empty', async () => {
            let driver = new IndexedDBDriver<TestData>(uid(), 1);

            expect(await driver.all()).toEqual({});
        });
    });


    describe('clear', () => {
        it('removes all entries', async () => {
            let db = uid(),
                driver = new IndexedDBDriver<TestData>(db, 1);

            await driver.set('name', 'alice');
            await driver.set('age', 25);
            await driver.clear();

            expect(await driver.count()).toBe(0);
            expect(await driver.all()).toEqual({});
        });
    });


    describe('constructor / connect', () => {
        it('creates database and object store', async () => {
            let driver = new IndexedDBDriver<TestData>(uid(), 1);

            expect(await driver.count()).toBe(0);
        });

        it('reuses connection for same name+version', async () => {
            let db = uid(),
                a = new IndexedDBDriver<TestData>(db, 1),
                b = new IndexedDBDriver<TestData>(db, 1);

            await a.set('name', 'alice');

            expect(await b.get('name')).toBe('alice');
        });
    });


    describe('count', () => {
        it('returns 0 when empty', async () => {
            let driver = new IndexedDBDriver<TestData>(uid(), 1);

            expect(await driver.count()).toBe(0);
        });

        it('returns correct count of stored items', async () => {
            let db = uid(),
                driver = new IndexedDBDriver<TestData>(db, 1);

            await driver.set('name', 'alice');
            await driver.set('age', 30);
            await driver.set('tags', ['a', 'b']);

            expect(await driver.count()).toBe(3);
        });
    });


    describe('delete', () => {
        it('handles deleting non-existent keys without error', async () => {
            let driver = new IndexedDBDriver<TestData>(uid(), 1);

            await expect(driver.delete(['name', 'age'])).resolves.toBeUndefined();
        });

        it('removes specified keys', async () => {
            let db = uid(),
                driver = new IndexedDBDriver<TestData>(db, 1);

            await driver.set('name', 'alice');
            await driver.set('age', 30);
            await driver.set('tags', ['x']);

            await driver.delete(['name', 'tags']);

            expect(await driver.get('name')).toBeUndefined();
            expect(await driver.get('tags')).toBeUndefined();
            expect(await driver.get('age')).toBe(30);
            expect(await driver.count()).toBe(1);
        });
    });


    describe('keys', () => {
        it('returns all keys', async () => {
            let db = uid(),
                driver = new IndexedDBDriver<TestData>(db, 1);

            await driver.set('name', 'alice');
            await driver.set('age', 30);

            let keys = await driver.keys();

            expect(keys.sort()).toEqual(['age', 'name']);
        });

        it('returns empty array when empty', async () => {
            let driver = new IndexedDBDriver<TestData>(uid(), 1);

            expect(await driver.keys()).toEqual([]);
        });
    });


    describe('map', () => {
        it('iterates over all entries with correct value, key, and index', async () => {
            let db = uid(),
                driver = new IndexedDBDriver<TestData>(db, 1),
                entries: { i: number; key: keyof TestData; value: TestData[keyof TestData] }[] = [];

            await driver.set('age', 25);
            await driver.set('name', 'bob');

            await driver.map((value, key, i) => {
                entries.push({ i, key, value });
            });

            expect(entries).toHaveLength(2);

            entries.sort((a, b) => (a.key as string).localeCompare(b.key as string));

            expect(entries[0]).toEqual({ i: expect.any(Number), key: 'age', value: 25 });
            expect(entries[1]).toEqual({ i: expect.any(Number), key: 'name', value: 'bob' });
        });

        it('works on empty store with no callback invocations', async () => {
            let called = false,
                driver = new IndexedDBDriver<TestData>(uid(), 1);

            await driver.map(() => {
                called = true;
            });

            expect(called).toBe(false);
        });
    });


    describe('only', () => {
        it('returns empty Map when no keys match', async () => {
            let driver = new IndexedDBDriver<TestData>(uid(), 1),
                result = await driver.only(['name', 'age']);

            expect(result.size).toBe(0);
        });

        it('returns Map with only requested keys', async () => {
            let db = uid(),
                driver = new IndexedDBDriver<TestData>(db, 1);

            await driver.set('name', 'alice');
            await driver.set('age', 30);
            await driver.set('tags', ['a']);

            let result = await driver.only(['name', 'tags']);

            expect(result.size).toBe(2);
            expect(result.get('name')).toBe('alice');
            expect(result.get('tags')).toEqual(['a']);
        });

        it('skips keys that do not exist', async () => {
            let db = uid(),
                driver = new IndexedDBDriver<TestData>(db, 1);

            await driver.set('name', 'alice');

            let result = await driver.only(['name', 'age']);

            expect(result.size).toBe(1);
            expect(result.get('name')).toBe('alice');
            expect(result.has('age')).toBe(false);
        });
    });


    describe('replace', () => {
        it('replaces multiple entries at once', async () => {
            let db = uid(),
                driver = new IndexedDBDriver<TestData>(db, 1);

            await driver.set('name', 'alice');

            await driver.replace([
                ['name', 'bob'],
                ['age', 42],
                ['tags', ['x', 'y']]
            ]);

            expect(await driver.get('name')).toBe('bob');
            expect(await driver.get('age')).toBe(42);
            expect(await driver.get('tags')).toEqual(['x', 'y']);
            expect(await driver.count()).toBe(3);
        });
    });


    describe('set / get', () => {
        it('returns true on successful set', async () => {
            let driver = new IndexedDBDriver<TestData>(uid(), 1);

            expect(await driver.set('name', 'alice')).toBe(true);
        });

        it('returns undefined for non-existent key', async () => {
            let driver = new IndexedDBDriver<TestData>(uid(), 1);

            expect(await driver.get('name')).toBeUndefined();
        });

        it('sets and retrieves a number value', async () => {
            let db = uid(),
                driver = new IndexedDBDriver<TestData>(db, 1);

            await driver.set('age', 25);

            expect(await driver.get('age')).toBe(25);
        });

        it('sets and retrieves a string value', async () => {
            let db = uid(),
                driver = new IndexedDBDriver<TestData>(db, 1);

            await driver.set('name', 'alice');

            expect(await driver.get('name')).toBe('alice');
        });

        it('sets and retrieves an array value', async () => {
            let db = uid(),
                driver = new IndexedDBDriver<TestData>(db, 1);

            await driver.set('tags', ['a', 'b', 'c']);

            expect(await driver.get('tags')).toEqual(['a', 'b', 'c']);
        });

        it('sets and retrieves an object value', async () => {
            type ObjData = { meta: { nested: boolean; value: number } };

            let db = uid(),
                driver = new IndexedDBDriver<ObjData>(db, 1),
                obj = { nested: true, value: 42 };

            await driver.set('meta', obj);

            expect(await driver.get('meta')).toEqual(obj);
        });
    });
});
