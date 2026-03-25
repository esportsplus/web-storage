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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import createLocal, { DriverType } from '~/index';
import type { Local } from '~/index';


type TestData = { age: number; name: string; tags: string[] };


let idbId = 0;

function uid() {
    return `test-local-db-${++idbId}`;
}


describe('Local (IndexedDB driver)', () => {

    describe('with encryption', () => {
        it('all — decrypts all values', async () => {
            let store = createLocal<TestData>({ name: uid(), version: 1 }, 'test-secret');

            await store.set('age', 30);
            await store.set('name', 'alice');

            let result = await store.all();

            expect(result).toEqual({ age: 30, name: 'alice' });
        });

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

        it('get — returns undefined for non-existent key', async () => {
            expect(await store.get('name')).toBeUndefined();
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


describe('Local (Memory driver)', () => {
    let store: Local<TestData>;

    beforeEach(() => {
        store = createLocal<TestData>({ driver: DriverType.Memory, name: 'test', version: 1 });
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

        it('get — returns undefined for non-existent key', async () => {
            expect(await store.get('name')).toBeUndefined();
        });

        it('keys — returns all keys', async () => {
            await store.set('age', 25);
            await store.set('name', 'alice');

            let result = await store.keys();

            expect(result.sort()).toEqual(['age', 'name']);
        });

        it('set / get — basic round-trip', async () => {
            await store.set('name', 'bob');

            expect(await store.get('name')).toBe('bob');
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

    it('uses Memory when DriverType.Memory specified', async () => {
        let store = createLocal<TestData>({ driver: DriverType.Memory, name: 'factory-mem', version: 1 });

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


describe('get(key, factory) — IndexedDB driver', () => {
    let now: number;

    beforeEach(() => {
        now = Date.now();
        vi.spyOn(Date, 'now').mockImplementation(() => now);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });


    it('returns factory value when key is missing', async () => {
        let store = createLocal<TestData>({ name: uid(), version: 1 });

        let result = await store.get('name', () => 'default');

        expect(result).toBe('default');
    });

    it('returns stored value when key exists — factory NOT called', async () => {
        let called = false,
            store = createLocal<TestData>({ name: uid(), version: 1 });

        await store.set('name', 'alice');

        let result = await store.get('name', () => {
            called = true;
            return 'default';
        });

        expect(result).toBe('alice');
        expect(called).toBe(false);
    });

    it('works with async factory', async () => {
        let store = createLocal<TestData>({ name: uid(), version: 1 });

        let result = await store.get('name', async () => {
            return 'async-value';
        });

        expect(result).toBe('async-value');
    });

    it('works with sync factory', async () => {
        let store = createLocal<TestData>({ name: uid(), version: 1 });

        let result = await store.get('age', () => 42);

        expect(result).toBe(42);
    });

    it('fires-and-forgets the set — value persisted after await', async () => {
        let store = createLocal<TestData>({ name: uid(), version: 1 });

        await store.get('name', () => 'lazy');

        // Allow fire-and-forget set to complete
        await new Promise((r) => setTimeout(r, 50));

        let persisted = await store.get('name');

        expect(persisted).toBe('lazy');
    });

    it('triggers factory on expired TTL entry', async () => {
        let store = createLocal<TestData>({ name: uid(), version: 1 });

        await store.set('name', 'old', { ttl: 10000 });

        now += 10001;

        let result = await store.get('name', () => 'refreshed');

        expect(result).toBe('refreshed');
    });

    it('without factory — backward compatible, returns undefined', async () => {
        let store = createLocal<TestData>({ name: uid(), version: 1 });

        let result = await store.get('name');

        expect(result).toBeUndefined();
    });
});


describe('get(key, factory) — LocalStorage driver', () => {
    let now: number;

    beforeEach(() => {
        localStorage.clear();
        now = Date.now();
        vi.spyOn(Date, 'now').mockImplementation(() => now);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });


    it('returns factory value when key is missing', async () => {
        let store = createLocal<TestData>({ driver: DriverType.LocalStorage, name: 'factory-ls', version: 1 });

        let result = await store.get('name', () => 'default');

        expect(result).toBe('default');
    });

    it('returns stored value when key exists — factory NOT called', async () => {
        let called = false,
            store = createLocal<TestData>({ driver: DriverType.LocalStorage, name: 'factory-ls', version: 1 });

        await store.set('name', 'alice');

        let result = await store.get('name', () => {
            called = true;
            return 'default';
        });

        expect(result).toBe('alice');
        expect(called).toBe(false);
    });

    it('works with async factory', async () => {
        let store = createLocal<TestData>({ driver: DriverType.LocalStorage, name: 'factory-ls', version: 1 });

        let result = await store.get('name', async () => {
            return 'async-value';
        });

        expect(result).toBe('async-value');
    });

    it('works with sync factory', async () => {
        let store = createLocal<TestData>({ driver: DriverType.LocalStorage, name: 'factory-ls', version: 1 });

        let result = await store.get('age', () => 42);

        expect(result).toBe(42);
    });

    it('fires-and-forgets the set — value persisted after await', async () => {
        let store = createLocal<TestData>({ driver: DriverType.LocalStorage, name: 'factory-ls', version: 1 });

        await store.get('name', () => 'lazy');

        // Allow fire-and-forget set to complete
        await new Promise((r) => setTimeout(r, 50));

        let persisted = await store.get('name');

        expect(persisted).toBe('lazy');
    });

    it('triggers factory on expired TTL entry', async () => {
        let store = createLocal<TestData>({ driver: DriverType.LocalStorage, name: 'factory-ls', version: 1 });

        await store.set('name', 'old', { ttl: 10000 });

        now += 10001;

        let result = await store.get('name', () => 'refreshed');

        expect(result).toBe('refreshed');
    });

    it('without factory — backward compatible, returns undefined', async () => {
        let store = createLocal<TestData>({ driver: DriverType.LocalStorage, name: 'factory-ls', version: 1 });

        let result = await store.get('name');

        expect(result).toBeUndefined();
    });
});


describe('TTL / Expiration (IndexedDB driver)', () => {
    let now: number;

    beforeEach(() => {
        now = Date.now();
        vi.spyOn(Date, 'now').mockImplementation(() => now);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });


    it('get — returns value before TTL expires', async () => {
        let store = createLocal<TestData>({ name: uid(), version: 1 });

        await store.set('name', 'alice', { ttl: 60000 });

        expect(await store.get('name')).toBe('alice');
    });

    it('get — returns undefined after TTL expires', async () => {
        let store = createLocal<TestData>({ name: uid(), version: 1 });

        await store.set('name', 'alice', { ttl: 60000 });

        now += 60001;

        expect(await store.get('name')).toBeUndefined();
    });

    it('ttl — returns remaining ms', async () => {
        let store = createLocal<TestData>({ name: uid(), version: 1 });

        await store.set('name', 'alice', { ttl: 60000 });

        now += 10000;

        let remaining = await store.ttl('name');

        expect(remaining).toBe(50000);
    });

    it('ttl — returns -1 for no-TTL key', async () => {
        let store = createLocal<TestData>({ name: uid(), version: 1 });

        await store.set('name', 'alice');

        expect(await store.ttl('name')).toBe(-1);
    });

    it('ttl — returns -1 for non-existent key', async () => {
        let store = createLocal<TestData>({ name: uid(), version: 1 });

        expect(await store.ttl('name')).toBe(-1);
    });

    it('persist — removes TTL, value still accessible', async () => {
        let store = createLocal<TestData>({ name: uid(), version: 1 });

        await store.set('name', 'alice', { ttl: 60000 });

        await store.persist('name');

        now += 120000;

        expect(await store.get('name')).toBe('alice');
        expect(await store.ttl('name')).toBe(-1);
    });

    it('cleanup — removes all expired entries', async () => {
        let store = createLocal<TestData>({ name: uid(), version: 1 });

        await store.set('name', 'alice', { ttl: 10000 });
        await store.set('age', 30, { ttl: 10000 });
        await store.set('tags', ['a']);

        now += 10001;

        await store.cleanup();

        expect(await store.count()).toBe(1);
        expect(await store.get('tags')).toEqual(['a']);
    });

    it('set — without TTL works as before (backward compat)', async () => {
        let store = createLocal<TestData>({ name: uid(), version: 1 });

        await store.set('name', 'alice');

        now += 999999;

        expect(await store.get('name')).toBe('alice');
    });

    it('set — with TTL + encryption round-trips correctly', async () => {
        let store = createLocal<TestData>({ name: uid(), version: 1 }, 'test-secret');

        await store.set('name', 'alice', { ttl: 60000 });

        expect(await store.get('name')).toBe('alice');

        now += 60001;

        expect(await store.get('name')).toBeUndefined();
    });

    it('all — skips expired entries', async () => {
        let store = createLocal<TestData>({ name: uid(), version: 1 });

        await store.set('name', 'alice', { ttl: 10000 });
        await store.set('age', 30);

        now += 10001;

        let result = await store.all();

        expect(result).toEqual({ age: 30 });
    });

    it('filter — skips expired entries', async () => {
        let store = createLocal<TestData>({ name: uid(), version: 1 });

        await store.set('name', 'alice', { ttl: 10000 });
        await store.set('age', 30);
        await store.set('tags', ['a'], { ttl: 10000 });

        now += 10001;

        let result = await store.filter(() => true);

        expect(result).toEqual({ age: 30 });
    });

    it('only — skips expired entries', async () => {
        let store = createLocal<TestData>({ name: uid(), version: 1 });

        await store.set('name', 'alice', { ttl: 10000 });
        await store.set('age', 30);

        now += 10001;

        let result = await store.only('name', 'age');

        expect(result).toEqual({ age: 30 });
    });
});


describe('TTL / Expiration (LocalStorage driver)', () => {
    let now: number;

    beforeEach(() => {
        localStorage.clear();
        now = Date.now();
        vi.spyOn(Date, 'now').mockImplementation(() => now);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });


    it('get — returns value before TTL expires', async () => {
        let store = createLocal<TestData>({ driver: DriverType.LocalStorage, name: 'ttl-ls', version: 1 });

        await store.set('name', 'alice', { ttl: 60000 });

        expect(await store.get('name')).toBe('alice');
    });

    it('get — returns undefined after TTL expires', async () => {
        let store = createLocal<TestData>({ driver: DriverType.LocalStorage, name: 'ttl-ls', version: 1 });

        await store.set('name', 'alice', { ttl: 60000 });

        now += 60001;

        expect(await store.get('name')).toBeUndefined();
    });

    it('ttl — returns remaining ms', async () => {
        let store = createLocal<TestData>({ driver: DriverType.LocalStorage, name: 'ttl-ls', version: 1 });

        await store.set('name', 'alice', { ttl: 60000 });

        now += 10000;

        let remaining = await store.ttl('name');

        expect(remaining).toBe(50000);
    });

    it('ttl — returns -1 for no-TTL key', async () => {
        let store = createLocal<TestData>({ driver: DriverType.LocalStorage, name: 'ttl-ls', version: 1 });

        await store.set('name', 'alice');

        expect(await store.ttl('name')).toBe(-1);
    });

    it('ttl — returns -1 for non-existent key', async () => {
        let store = createLocal<TestData>({ driver: DriverType.LocalStorage, name: 'ttl-ls', version: 1 });

        expect(await store.ttl('name')).toBe(-1);
    });

    it('persist — removes TTL, value still accessible', async () => {
        let store = createLocal<TestData>({ driver: DriverType.LocalStorage, name: 'ttl-ls', version: 1 });

        await store.set('name', 'alice', { ttl: 60000 });

        await store.persist('name');

        now += 120000;

        expect(await store.get('name')).toBe('alice');
        expect(await store.ttl('name')).toBe(-1);
    });

    it('cleanup — removes all expired entries', async () => {
        let store = createLocal<TestData>({ driver: DriverType.LocalStorage, name: 'ttl-ls', version: 1 });

        await store.set('name', 'alice', { ttl: 10000 });
        await store.set('age', 30, { ttl: 10000 });
        await store.set('tags', ['a']);

        now += 10001;

        await store.cleanup();

        expect(await store.count()).toBe(1);
        expect(await store.get('tags')).toEqual(['a']);
    });

    it('set — without TTL works as before (backward compat)', async () => {
        let store = createLocal<TestData>({ driver: DriverType.LocalStorage, name: 'ttl-ls', version: 1 });

        await store.set('name', 'alice');

        now += 999999;

        expect(await store.get('name')).toBe('alice');
    });

    it('set — with TTL + encryption round-trips correctly', async () => {
        let store = createLocal<TestData>({ driver: DriverType.LocalStorage, name: 'ttl-enc', version: 1 }, 'test-secret');

        await store.set('name', 'alice', { ttl: 60000 });

        expect(await store.get('name')).toBe('alice');

        now += 60001;

        expect(await store.get('name')).toBeUndefined();
    });

    it('all — skips expired entries', async () => {
        let store = createLocal<TestData>({ driver: DriverType.LocalStorage, name: 'ttl-ls', version: 1 });

        await store.set('name', 'alice', { ttl: 10000 });
        await store.set('age', 30);

        now += 10001;

        let result = await store.all();

        expect(result).toEqual({ age: 30 });
    });

    it('filter — skips expired entries', async () => {
        let store = createLocal<TestData>({ driver: DriverType.LocalStorage, name: 'ttl-ls', version: 1 });

        await store.set('name', 'alice', { ttl: 10000 });
        await store.set('age', 30);
        await store.set('tags', ['a'], { ttl: 10000 });

        now += 10001;

        let result = await store.filter(() => true);

        expect(result).toEqual({ age: 30 });
    });

    it('only — skips expired entries', async () => {
        let store = createLocal<TestData>({ driver: DriverType.LocalStorage, name: 'ttl-ls', version: 1 });

        await store.set('name', 'alice', { ttl: 10000 });
        await store.set('age', 30);

        now += 10001;

        let result = await store.only('name', 'age');

        expect(result).toEqual({ age: 30 });
    });
});


describe('Change Subscriptions', () => {
    let store: Local<TestData>;

    beforeEach(() => {
        store = createLocal<TestData>({ driver: DriverType.Memory, name: 'sub-test', version: 1 });
    });


    it('subscribe(key, cb) fires on set', async () => {
        let called = false;

        store.subscribe('name', () => { called = true; });
        await store.set('name', 'alice');

        expect(called).toBe(true);
    });

    it('subscribe(key, cb) receives correct newValue and oldValue', async () => {
        let captured: { newValue: unknown; oldValue: unknown } | null = null;

        await store.set('name', 'alice');

        store.subscribe('name', (newValue, oldValue) => {
            captured = { newValue, oldValue };
        });

        await store.set('name', 'bob');

        expect(captured).toEqual({ newValue: 'bob', oldValue: 'alice' });
    });

    it('subscribe(key, cb) fires on delete with undefined newValue', async () => {
        let captured: { newValue: unknown; oldValue: unknown } | null = null;

        await store.set('name', 'alice');

        store.subscribe('name', (newValue, oldValue) => {
            captured = { newValue, oldValue };
        });

        await store.delete('name');

        expect(captured).toEqual({ newValue: undefined, oldValue: 'alice' });
    });

    it('subscribe(cb) fires for any key change', async () => {
        let calls: { key: unknown; newValue: unknown }[] = [];

        store.subscribe((key, newValue) => {
            calls.push({ key, newValue });
        });

        await store.set('name', 'alice');
        await store.set('age', 30);

        expect(calls).toHaveLength(2);
        expect(calls[0]).toEqual({ key: 'name', newValue: 'alice' });
        expect(calls[1]).toEqual({ key: 'age', newValue: 30 });
    });

    it('unsubscribe stops notifications', async () => {
        let count = 0,
            unsubscribe = store.subscribe('name', () => { count++; });

        await store.set('name', 'alice');

        expect(count).toBe(1);

        unsubscribe();

        await store.set('name', 'bob');

        expect(count).toBe(1);
    });

    it('subscribe fires on replace', async () => {
        let calls: { key: unknown; newValue: unknown; oldValue: unknown }[] = [];

        await store.set('name', 'alice');
        await store.set('age', 25);

        store.subscribe((key, newValue, oldValue) => {
            calls.push({ key, newValue, oldValue });
        });

        await store.replace({ age: 30, name: 'bob' });

        calls.sort((a, b) => (a.key as string).localeCompare(b.key as string));

        expect(calls).toHaveLength(2);
        expect(calls[0]).toEqual({ key: 'age', newValue: 30, oldValue: 25 });
        expect(calls[1]).toEqual({ key: 'name', newValue: 'bob', oldValue: 'alice' });
    });

    it('subscribe fires on clear for each key', async () => {
        let calls: { key: unknown; newValue: unknown; oldValue: unknown }[] = [];

        await store.set('name', 'alice');
        await store.set('age', 30);

        store.subscribe((key, newValue, oldValue) => {
            calls.push({ key, newValue, oldValue });
        });

        await store.clear();

        calls.sort((a, b) => (a.key as string).localeCompare(b.key as string));

        expect(calls).toHaveLength(2);
        expect(calls[0]).toEqual({ key: 'age', newValue: undefined, oldValue: 30 });
        expect(calls[1]).toEqual({ key: 'name', newValue: undefined, oldValue: 'alice' });
    });

    it('multiple subscribers on same key all fire', async () => {
        let count1 = 0,
            count2 = 0;

        store.subscribe('name', () => { count1++; });
        store.subscribe('name', () => { count2++; });

        await store.set('name', 'alice');

        expect(count1).toBe(1);
        expect(count2).toBe(1);
    });

    it('subscribe does NOT fire for unrelated keys', async () => {
        let called = false;

        store.subscribe('name', () => { called = true; });

        await store.set('age', 30);

        expect(called).toBe(false);
    });
});
