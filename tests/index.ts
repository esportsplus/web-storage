import 'fake-indexeddb/auto';

import { vi } from 'vitest';

vi.mock('@esportsplus/utilities', () => ({
    decrypt: vi.fn(async (content: string, _password: string) => {
        return atob(content);
    }),
    encrypt: vi.fn(async (content: unknown, _password: string) => {
        return btoa(content as string);
    })
}));

import { decrypt, encrypt } from '@esportsplus/utilities';
import { beforeEach, describe, expect, it } from 'vitest';

import createLocal, { DriverType } from '~/index';
import type { Local } from '~/index';


type TestData = { age: number; name: string; tags: string[] };


let idbId = 0;

function uid() {
    return `test-local-db-${++idbId}`;
}


describe('Local (IndexedDB driver)', () => {

    describe('with encryption', () => {
        it('set / get — round-trip with secret', async () => {
            let store = createLocal<TestData>({ name: uid(), version: 1 }, 'test-secret');

            await store.set('name', 'alice');

            expect(await store.get('name')).toBe('alice');
        });

        it('set / get — round-trip object with secret', async () => {
            type ObjData = { meta: { nested: boolean; value: number } };

            let store = createLocal<ObjData>({ name: uid(), version: 1 }, 'test-secret');

            await store.set('meta', { nested: true, value: 42 });

            expect(await store.get('meta')).toEqual({ nested: true, value: 42 });
        });
    });


    describe('without encryption', () => {
        it('all — returns all entries', async () => {
            let store = createLocal<TestData>({ name: uid(), version: 1 });

            await store.set('age', 30);
            await store.set('name', 'alice');
            await store.set('tags', ['a', 'b']);

            let result = await store.all();

            expect(result).toEqual({ age: 30, name: 'alice', tags: ['a', 'b'] });
        });

        it('clear — removes all entries', async () => {
            let store = createLocal<TestData>({ name: uid(), version: 1 });

            await store.set('age', 25);
            await store.set('name', 'alice');
            await store.clear();

            expect(await store.count()).toBe(0);
            expect(await store.all()).toEqual({});
        });

        it('count — returns correct count', async () => {
            let store = createLocal<TestData>({ name: uid(), version: 1 });

            await store.set('age', 25);
            await store.set('name', 'alice');

            expect(await store.count()).toBe(2);
        });

        it('delete — removes specified keys', async () => {
            let store = createLocal<TestData>({ name: uid(), version: 1 });

            await store.set('age', 30);
            await store.set('name', 'alice');
            await store.set('tags', ['a']);
            await store.delete('name', 'tags');

            expect(await store.get('name')).toBeUndefined();
            expect(await store.get('tags')).toBeUndefined();
            expect(await store.get('age')).toBe(30);
        });

        it('filter — filters entries by predicate', async () => {
            let store = createLocal<TestData>({ name: uid(), version: 1 });

            await store.set('age', 30);
            await store.set('name', 'alice');
            await store.set('tags', ['a', 'b']);

            let result = await store.filter(({ key }) => key === 'name' || key === 'tags');

            expect(result).toEqual({ name: 'alice', tags: ['a', 'b'] });
        });

        it('filter — stop mechanism halts iteration', async () => {
            let store = createLocal<TestData>({ name: uid(), version: 1 });

            await store.set('age', 30);
            await store.set('name', 'alice');
            await store.set('tags', ['a']);

            let visited = 0;

            await store.filter(({ stop }) => {
                visited++;

                if (visited === 2) {
                    stop();
                }

                return true;
            });

            expect(visited).toBe(2);
        });

        it('keys — returns all keys', async () => {
            let store = createLocal<TestData>({ name: uid(), version: 1 });

            await store.set('age', 25);
            await store.set('name', 'alice');

            let result = await store.keys();

            expect(result.sort()).toEqual(['age', 'name']);
        });

        it('length — returns correct count', async () => {
            let store = createLocal<TestData>({ name: uid(), version: 1 });

            await store.set('age', 25);
            await store.set('name', 'alice');

            expect(await store.length()).toBe(2);
        });

        it('map — iterates all entries', async () => {
            let store = createLocal<TestData>({ name: uid(), version: 1 });

            await store.set('age', 25);
            await store.set('name', 'alice');

            let entries: { i: number; key: keyof TestData; value: TestData[keyof TestData] }[] = [];

            await store.map((value, key, i) => {
                entries.push({ i, key, value });
            });

            expect(entries).toHaveLength(2);

            entries.sort((a, b) => (a.key as string).localeCompare(b.key as string));

            expect(entries[0]).toEqual({ i: expect.any(Number), key: 'age', value: 25 });
            expect(entries[1]).toEqual({ i: expect.any(Number), key: 'name', value: 'alice' });
        });

        it('only — returns subset of entries', async () => {
            let store = createLocal<TestData>({ name: uid(), version: 1 });

            await store.set('age', 30);
            await store.set('name', 'alice');
            await store.set('tags', ['a']);

            let result = await store.only('name', 'tags');

            expect(result).toEqual({ name: 'alice', tags: ['a'] });
        });

        it('replace — batch replace returns empty failed array', async () => {
            let store = createLocal<TestData>({ name: uid(), version: 1 });

            let failed = await store.replace({ age: 25, name: 'bob', tags: ['x', 'y'] });

            expect(failed).toEqual([]);
            expect(await store.get('age')).toBe(25);
            expect(await store.get('name')).toBe('bob');
            expect(await store.get('tags')).toEqual(['x', 'y']);
        });

        it('set / get — basic round-trip', async () => {
            let store = createLocal<TestData>({ name: uid(), version: 1 });

            await store.set('name', 'bob');

            expect(await store.get('name')).toBe('bob');
        });
    });
});


describe('Local (LocalStorage driver)', () => {
    let store: Local<TestData>;

    beforeEach(() => {
        localStorage.clear();
        store = createLocal<TestData>({ driver: DriverType.LocalStorage, name: 'test', version: 1 });
    });


    describe('with encryption', () => {
        let encrypted: Local<TestData>;

        beforeEach(() => {
            encrypted = createLocal<TestData>({ driver: DriverType.LocalStorage, name: 'enc', version: 1 }, 'test-secret');
        });


        it('all — decrypts all values', async () => {
            await encrypted.set('age', 30);
            await encrypted.set('name', 'alice');

            let result = await encrypted.all();

            expect(result).toEqual({ age: 30, name: 'alice' });
        });

        it('replace — encrypts on write, decrypts on read', async () => {
            let failed = await encrypted.replace({ age: 25, name: 'bob', tags: ['x'] });

            expect(failed).toEqual([]);
            expect(await encrypted.get('age')).toBe(25);
            expect(await encrypted.get('name')).toBe('bob');
            expect(await encrypted.get('tags')).toEqual(['x']);
        });

        it('set / get — round-trip with secret', async () => {
            await encrypted.set('name', 'alice');

            expect(await encrypted.get('name')).toBe('alice');
        });

        it('set / get — round-trip number with secret', async () => {
            await encrypted.set('age', 42);

            expect(await encrypted.get('age')).toBe(42);
        });

        it('set / get — round-trip object with secret', async () => {
            await encrypted.set('tags', ['a', 'b', 'c']);

            expect(await encrypted.get('tags')).toEqual(['a', 'b', 'c']);
        });
    });


    describe('error branches', () => {
        let encrypted: Local<TestData>;

        beforeEach(() => {
            encrypted = createLocal<TestData>({ driver: DriverType.LocalStorage, name: 'err', version: 1 }, 'test-secret');
        });


        it('get — returns undefined when decrypt fails', async () => {
            await encrypted.set('name', 'alice');

            vi.mocked(decrypt).mockRejectedValueOnce(new Error('decrypt failed'));

            expect(await encrypted.get('name')).toBeUndefined();
        });

        it('replace — returns failed keys when encrypt throws', async () => {
            vi.mocked(encrypt).mockRejectedValueOnce(new Error('encrypt failed'));

            let failed = await encrypted.replace({ age: 25, name: 'bob' });

            expect(failed).toContain('age');
            expect(failed).toHaveLength(1);
            expect(await encrypted.get('name')).toBe('bob');
        });

        it('set — returns false when encrypt throws', async () => {
            vi.mocked(encrypt).mockRejectedValueOnce(new Error('encrypt failed'));

            expect(await encrypted.set('name', 'alice')).toBe(false);
        });
    });


    describe('without encryption', () => {
        it('all — returns all entries', async () => {
            await store.set('age', 30);
            await store.set('name', 'alice');
            await store.set('tags', ['a', 'b']);

            let result = await store.all();

            expect(result).toEqual({ age: 30, name: 'alice', tags: ['a', 'b'] });
        });

        it('clear — removes all entries', async () => {
            await store.set('age', 25);
            await store.set('name', 'alice');
            await store.clear();

            expect(await store.count()).toBe(0);
            expect(await store.all()).toEqual({});
        });

        it('count — returns correct count', async () => {
            await store.set('age', 25);
            await store.set('name', 'alice');

            expect(await store.count()).toBe(2);
        });

        it('delete — removes specified keys', async () => {
            await store.set('age', 30);
            await store.set('name', 'alice');
            await store.set('tags', ['a']);
            await store.delete('name', 'tags');

            expect(await store.get('name')).toBeUndefined();
            expect(await store.get('tags')).toBeUndefined();
            expect(await store.get('age')).toBe(30);
        });

        it('filter — filters entries by predicate', async () => {
            await store.set('age', 30);
            await store.set('name', 'alice');
            await store.set('tags', ['a', 'b']);

            let result = await store.filter(({ key }) => key === 'name' || key === 'tags');

            expect(result).toEqual({ name: 'alice', tags: ['a', 'b'] });
        });

        it('filter — stop mechanism halts iteration', async () => {
            await store.set('age', 30);
            await store.set('name', 'alice');
            await store.set('tags', ['a']);

            let visited = 0;

            let result = await store.filter(({ stop, value }) => {
                visited++;

                if (visited === 2) {
                    stop();
                }

                return typeof value === 'string';
            });

            let keys = Object.keys(result);

            expect(keys.length).toBeLessThanOrEqual(2);
            expect(visited).toBe(2);
        });

        it('keys — returns all keys', async () => {
            await store.set('age', 25);
            await store.set('name', 'alice');

            let result = await store.keys();

            expect(result.sort()).toEqual(['age', 'name']);
        });

        it('length — returns correct count', async () => {
            await store.set('age', 25);
            await store.set('name', 'alice');

            expect(await store.length()).toBe(2);
        });

        it('map — iterates all entries', async () => {
            await store.set('age', 25);
            await store.set('name', 'alice');

            let entries: { i: number; key: keyof TestData; value: TestData[keyof TestData] }[] = [];

            await store.map((value, key, i) => {
                entries.push({ i, key, value });
            });

            expect(entries).toHaveLength(2);

            entries.sort((a, b) => (a.key as string).localeCompare(b.key as string));

            expect(entries[0]).toEqual({ i: expect.any(Number), key: 'age', value: 25 });
            expect(entries[1]).toEqual({ i: expect.any(Number), key: 'name', value: 'alice' });
        });

        it('only — returns subset of entries', async () => {
            await store.set('age', 30);
            await store.set('name', 'alice');
            await store.set('tags', ['a']);

            let result = await store.only('name', 'tags');

            expect(result).toEqual({ name: 'alice', tags: ['a'] });
        });

        it('replace — batch replace returns empty failed array', async () => {
            let failed = await store.replace({ age: 25, name: 'bob', tags: ['x', 'y'] });

            expect(failed).toEqual([]);
            expect(await store.get('age')).toBe(25);
            expect(await store.get('name')).toBe('bob');
            expect(await store.get('tags')).toEqual(['x', 'y']);
        });

        it('set / get — array value', async () => {
            await store.set('tags', ['a', 'b', 'c']);

            expect(await store.get('tags')).toEqual(['a', 'b', 'c']);
        });

        it('set / get — number value', async () => {
            await store.set('age', 42);

            expect(await store.get('age')).toBe(42);
        });

        it('set / get — object value', async () => {
            type ObjData = { meta: { nested: boolean; value: number } };

            let objStore = createLocal<ObjData>({ driver: DriverType.LocalStorage, name: 'obj', version: 1 });

            await objStore.set('meta', { nested: true, value: 99 });

            expect(await objStore.get('meta')).toEqual({ nested: true, value: 99 });
        });

        it('set / get — string value', async () => {
            await store.set('name', 'alice');

            expect(await store.get('name')).toBe('alice');
        });
    });
});


describe('factory function', () => {

    it('accepts optional secret parameter', () => {
        let store = createLocal<TestData>({ name: uid(), version: 1 }, 'my-secret');

        expect(store).toBeDefined();
    });

    it('defaults to IndexedDB when no driver specified', async () => {
        let store = createLocal<TestData>({ name: uid(), version: 1 });

        await store.set('name', 'test');

        expect(await store.get('name')).toBe('test');
    });

    it('uses LocalStorage when DriverType.LocalStorage specified', async () => {
        localStorage.clear();

        let store = createLocal<TestData>({ driver: DriverType.LocalStorage, name: 'factory-ls', version: 1 });

        await store.set('name', 'test');

        expect(localStorage.getItem('factory-ls:1:name')).toBe('"test"');
    });
});
