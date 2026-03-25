import { beforeEach, describe, expect, it } from 'vitest';

import { MemoryDriver } from '~/drivers/memory';


type TestData = { age: number; name: string; tags: string[] };


describe('MemoryDriver', () => {
    let driver: MemoryDriver<TestData>;

    beforeEach(() => {
        driver = new MemoryDriver<TestData>('test', 1);
    });


    describe('all', () => {
        it('returns all stored key-value pairs', async () => {
            await driver.set('name', 'alice');
            await driver.set('age', 30);
            await driver.set('tags', ['a', 'b']);

            let result = await driver.all();

            expect(result).toEqual({ age: 30, name: 'alice', tags: ['a', 'b'] });
        });

        it('returns empty object when storage is empty', async () => {
            let result = await driver.all();

            expect(result).toEqual({});
        });
    });


    describe('clear', () => {
        it('removes all entries', async () => {
            await driver.set('name', 'alice');
            await driver.set('age', 30);
            await driver.clear();

            expect(await driver.count()).toBe(0);
            expect(await driver.all()).toEqual({});
        });
    });


    describe('constructor', () => {
        it('creates with empty store', async () => {
            let d = new MemoryDriver<TestData>('myapp', 2);

            expect(await d.count()).toBe(0);
        });
    });


    describe('count', () => {
        it('returns 0 when empty', async () => {
            expect(await driver.count()).toBe(0);
        });

        it('returns correct count of stored items', async () => {
            await driver.set('name', 'alice');
            await driver.set('age', 30);

            expect(await driver.count()).toBe(2);
        });
    });


    describe('delete', () => {
        it('handles deleting non-existent keys without error', async () => {
            await expect(driver.delete(['name', 'age'])).resolves.toBeUndefined();
        });

        it('removes specified keys', async () => {
            await driver.set('name', 'alice');
            await driver.set('age', 30);
            await driver.set('tags', ['a']);
            await driver.delete(['name', 'tags']);

            expect(await driver.get('name')).toBeUndefined();
            expect(await driver.get('tags')).toBeUndefined();
            expect(await driver.get('age')).toBe(30);
        });
    });


    describe('isolation', () => {
        it('two drivers do not share data', async () => {
            let driverA = new MemoryDriver<TestData>('app', 1),
                driverB = new MemoryDriver<TestData>('app', 1);

            await driverA.set('name', 'alice');
            await driverB.set('name', 'bob');

            expect(await driverA.get('name')).toBe('alice');
            expect(await driverB.get('name')).toBe('bob');
        });
    });


    describe('keys', () => {
        it('returns all keys', async () => {
            await driver.set('name', 'alice');
            await driver.set('age', 30);

            let result = await driver.keys();

            expect(result.sort()).toEqual(['age', 'name']);
        });

        it('returns empty array when empty', async () => {
            expect(await driver.keys()).toEqual([]);
        });
    });


    describe('map', () => {
        it('iterates over all entries with correct value, key, and index', async () => {
            await driver.set('age', 25);
            await driver.set('name', 'alice');

            let entries: { i: number; key: keyof TestData; value: TestData[keyof TestData] }[] = [];

            await driver.map((value, key, i) => {
                entries.push({ i, key, value });
            });

            expect(entries).toHaveLength(2);

            entries.sort((a, b) => (a.key as string).localeCompare(b.key as string));

            expect(entries[0]).toEqual({ i: expect.any(Number), key: 'age', value: 25 });
            expect(entries[1]).toEqual({ i: expect.any(Number), key: 'name', value: 'alice' });
        });

        it('does not invoke callback on empty store', async () => {
            let called = false;

            await driver.map(() => {
                called = true;
            });

            expect(called).toBe(false);
        });
    });


    describe('only', () => {
        it('returns empty Map when no keys match', async () => {
            await driver.set('name', 'alice');

            let result = await driver.only(['age', 'tags']);

            expect(result.size).toBe(0);
        });

        it('returns Map with only requested keys', async () => {
            await driver.set('name', 'alice');
            await driver.set('age', 30);
            await driver.set('tags', ['a']);

            let result = await driver.only(['name', 'tags']);

            expect(result.size).toBe(2);
            expect(result.get('name')).toBe('alice');
            expect(result.get('tags')).toEqual(['a']);
        });

        it('skips keys that do not exist', async () => {
            await driver.set('name', 'alice');

            let result = await driver.only(['name', 'age']);

            expect(result.size).toBe(1);
            expect(result.get('name')).toBe('alice');
            expect(result.has('age')).toBe(false);
        });
    });


    describe('replace', () => {
        it('replaces multiple entries at once', async () => {
            await driver.replace([
                ['name', 'alice'],
                ['age', 30],
                ['tags', ['x', 'y']]
            ]);

            expect(await driver.get('name')).toBe('alice');
            expect(await driver.get('age')).toBe(30);
            expect(await driver.get('tags')).toEqual(['x', 'y']);
        });
    });


    describe('set / get', () => {
        it('overwrites existing key', async () => {
            await driver.set('name', 'alice');
            await driver.set('name', 'bob');

            expect(await driver.get('name')).toBe('bob');
            expect(await driver.count()).toBe(1);
        });

        it('returns true on successful set', async () => {
            expect(await driver.set('name', 'alice')).toBe(true);
        });

        it('returns undefined for non-existent key', async () => {
            expect(await driver.get('name')).toBeUndefined();
        });

        it('sets and retrieves a number value', async () => {
            await driver.set('age', 42);

            expect(await driver.get('age')).toBe(42);
        });

        it('sets and retrieves a string value', async () => {
            await driver.set('name', 'alice');

            expect(await driver.get('name')).toBe('alice');
        });

        it('sets and retrieves an array value', async () => {
            await driver.set('tags', ['a', 'b', 'c']);

            expect(await driver.get('tags')).toEqual(['a', 'b', 'c']);
        });

        it('sets and retrieves an object value', async () => {
            type ObjData = { meta: { nested: boolean; value: number } };

            let objDriver = new MemoryDriver<ObjData>('obj', 1);

            await objDriver.set('meta', { nested: true, value: 99 });

            expect(await objDriver.get('meta')).toEqual({ nested: true, value: 99 });
        });
    });
});
