import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LocalStorageDriver } from '~/drivers/localstorage';


type TestData = { age: number; name: string; tags: string[] };


describe('LocalStorageDriver', () => {
    let driver: LocalStorageDriver<TestData>;

    beforeEach(() => {
        localStorage.clear();
        driver = new LocalStorageDriver<TestData>('test', 1);
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

        it('skips entries with unparseable JSON', async () => {
            await driver.set('name', 'alice');
            localStorage.setItem('test:1:age', '{invalid json');

            let result = await driver.all();

            expect(result).toEqual({ name: 'alice' });
        });
    });


    describe('clear', () => {
        it('does NOT remove keys from other drivers', async () => {
            let other = new LocalStorageDriver<TestData>('other', 1);

            await driver.set('name', 'alice');
            await other.set('name', 'bob');
            await driver.clear();

            expect(await other.get('name')).toBe('bob');
        });

        it('removes all prefixed keys', async () => {
            await driver.set('name', 'alice');
            await driver.set('age', 30);
            await driver.clear();

            expect(await driver.count()).toBe(0);
            expect(await driver.all()).toEqual({});
        });
    });


    describe('constructor', () => {
        it('creates with correct prefix format name:version:', async () => {
            let d = new LocalStorageDriver<TestData>('myapp', 2);

            await d.set('name', 'test');

            expect(localStorage.getItem('myapp:2:name')).toBe('"test"');
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


    describe('keys', () => {
        it('returns all keys without prefix', async () => {
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

        it('skips entries with unparseable values', async () => {
            await driver.set('name', 'alice');
            localStorage.setItem('test:1:age', 'not-json');

            let keys: (keyof TestData)[] = [];

            await driver.map((_value, key) => {
                keys.push(key);
            });

            expect(keys).toEqual(['name']);
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


    describe('prefix isolation', () => {
        it('two drivers with different name/version do not see each other\'s data', async () => {
            let driverA = new LocalStorageDriver<TestData>('app', 1),
                driverB = new LocalStorageDriver<TestData>('app', 2);

            await driverA.set('name', 'alice');
            await driverB.set('name', 'bob');

            expect(await driverA.get('name')).toBe('alice');
            expect(await driverB.get('name')).toBe('bob');
            expect(await driverA.count()).toBe(1);
            expect(await driverB.count()).toBe(1);
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


    describe('compression', () => {
        type LargeData = { bio: string };

        let largeDriver: LocalStorageDriver<LargeData>,
            largeValue: string;

        beforeEach(() => {
            largeDriver = new LocalStorageDriver<LargeData>('lz', 1);
            largeValue = 'a'.repeat(200);
        });

        it('stores small values without compression prefix', async () => {
            await driver.set('name', 'alice');

            let raw = localStorage.getItem('test:1:name')!;

            expect(raw.charCodeAt(0)).not.toBe(1);
            expect(raw).toBe('"alice"');
        });

        it('stores large values with \\x01 prefix', async () => {
            await largeDriver.set('bio', largeValue);

            let raw = localStorage.getItem('lz:1:bio')!;

            expect(raw.charCodeAt(0)).toBe(1);
        });

        it('round-trips large values through set/get', async () => {
            await largeDriver.set('bio', largeValue);

            expect(await largeDriver.get('bio')).toBe(largeValue);
        });

        it('round-trips large values through replace/all', async () => {
            await largeDriver.replace([['bio', largeValue]]);

            let all = await largeDriver.all();

            expect(all.bio).toBe(largeValue);
        });

        it('reads existing uncompressed values (backward compat)', async () => {
            localStorage.setItem('lz:1:bio', JSON.stringify(largeValue));

            expect(await largeDriver.get('bio')).toBe(largeValue);
        });

        it('compressed output is smaller than raw JSON', async () => {
            await largeDriver.set('bio', largeValue);

            let compressed = localStorage.getItem('lz:1:bio')!,
                raw = JSON.stringify(largeValue);

            expect(compressed.length).toBeLessThan(raw.length);
        });

        it('handles 100-byte boundary correctly', async () => {
            type BoundaryData = { val: string };

            let boundaryDriver = new LocalStorageDriver<BoundaryData>('bound', 1);

            // JSON.stringify('"' + 'x'.repeat(97) + '"') = 97 chars + 2 quotes = "xxx...x" = 99 chars inside quotes, total 99+2=101? No.
            // JSON.stringify('x'.repeat(96)) = '"' + 'x'*96 + '"' = 98 bytes < 100 => no compress
            await boundaryDriver.set('val', 'x'.repeat(96));

            let rawSmall = localStorage.getItem('bound:1:val')!;

            expect(rawSmall.charCodeAt(0)).not.toBe(1);

            // JSON.stringify('x'.repeat(98)) = '"' + 'x'*98 + '"' = 100 bytes >= 100 => compress
            await boundaryDriver.set('val', 'x'.repeat(98));

            let rawLarge = localStorage.getItem('bound:1:val')!;

            expect(rawLarge.charCodeAt(0)).toBe(1);
        });

        it('parse returns undefined for corrupted compressed data', async () => {
            localStorage.setItem('lz:1:bio', '\x01corrupted-data');

            expect(await largeDriver.get('bio')).toBeUndefined();
        });
    });


    describe('set / get', () => {
        it('overwrites existing key', async () => {
            await driver.set('name', 'alice');
            await driver.set('name', 'bob');

            expect(await driver.get('name')).toBe('bob');
            expect(await driver.count()).toBe(1);
        });

        it('returns false when setItem throws', async () => {
            let spy = vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => {
                throw new Error('QuotaExceededError');
            });

            expect(await driver.set('name', 'alice')).toBe(false);

            spy.mockRestore();
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

            let objDriver = new LocalStorageDriver<ObjData>('obj', 1);

            await objDriver.set('meta', { nested: true, value: 99 });

            expect(await objDriver.get('meta')).toEqual({ nested: true, value: 99 });
        });
    });
});
