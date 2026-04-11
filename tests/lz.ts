import { describe, expect, it } from 'vitest';

import { compress, decompress } from '~/lz';


describe('LZ Compression', () => {

    describe('empty/null handling', () => {
        it('empty string round-trips', () => {
            expect(compress('')).toBe('');
            expect(decompress('')).toBe('');
        });
    });

    describe('single characters', () => {
        it('lowercase a', () => {
            let compressed = compress('a');

            expect(decompress(compressed)).toBe('a');
        });

        it('uppercase Z', () => {
            let compressed = compress('Z');

            expect(decompress(compressed)).toBe('Z');
        });

        it('null character (U+0000)', () => {
            let compressed = compress('\0');

            expect(decompress(compressed)).toBe('\0');
        });
    });

    describe('short ASCII strings', () => {
        it('hello world', () => {
            let input = 'hello world',
                compressed = compress(input);

            expect(decompress(compressed)).toBe(input);
        });

        it('the quick brown fox', () => {
            let input = 'The quick brown fox jumps over the lazy dog',
                compressed = compress(input);

            expect(decompress(compressed)).toBe(input);
        });

        it('numbers and symbols', () => {
            let input = '0123456789!@#$%^&*()_+-=[]{}|;:,.<>?',
                compressed = compress(input);

            expect(decompress(compressed)).toBe(input);
        });
    });

    describe('repetitive strings', () => {
        it('abcabc repeated 500 times', () => {
            let input = 'abc'.repeat(500),
                compressed = compress(input);

            expect(decompress(compressed)).toBe(input);
        });

        it('single char repeated 1000 times', () => {
            let input = 'x'.repeat(1000),
                compressed = compress(input);

            expect(decompress(compressed)).toBe(input);
        });

        it('aaabbbccc pattern repeated', () => {
            let input = 'aaabbbccc'.repeat(200),
                compressed = compress(input);

            expect(decompress(compressed)).toBe(input);
        });
    });

    describe('JSON-like strings', () => {
        it('1KB+ JSON string round-trips', () => {
            let items: Record<string, unknown>[] = [];

            for (let i = 0; i < 50; i++) {
                items.push({
                    age: 20 + (i % 60),
                    id: i,
                    name: `user_${i}`,
                    tags: ['alpha', 'beta', 'gamma']
                });
            }

            let input = JSON.stringify({ data: items, total: 50, type: 'users' }),
                compressed = compress(input);

            expect(input.length).toBeGreaterThan(1024);
            expect(decompress(compressed)).toBe(input);
        });

        it('nested JSON structure', () => {
            let input = JSON.stringify({
                config: {
                    database: { host: 'localhost', port: 5432 },
                    features: { darkMode: true, notifications: false }
                },
                users: [
                    { email: 'alice@test.com', name: 'alice' },
                    { email: 'bob@test.com', name: 'bob' }
                ]
            });

            let compressed = compress(input);

            expect(decompress(compressed)).toBe(input);
        });
    });

    describe('unicode', () => {
        it('emoji characters', () => {
            let input = '😀🎉🚀💯🔥✨',
                compressed = compress(input);

            expect(decompress(compressed)).toBe(input);
        });

        it('CJK characters', () => {
            let input = '日本語テスト',
                compressed = compress(input);

            expect(decompress(compressed)).toBe(input);
        });

        it('mixed scripts', () => {
            let input = 'Hello 世界! Привет мир! 🎉 café résumé naïve',
                compressed = compress(input);

            expect(decompress(compressed)).toBe(input);
        });

        it('arabic and hebrew', () => {
            let input = 'مرحبا שלום',
                compressed = compress(input);

            expect(decompress(compressed)).toBe(input);
        });
    });

    describe('byte value coverage', () => {
        it('all 256 byte values individually', () => {
            for (let i = 0; i < 256; i++) {
                let input = String.fromCharCode(i),
                    compressed = compress(input);

                expect(decompress(compressed)).toBe(input);
            }
        });

        it('all 256 byte values concatenated', () => {
            let chars: string[] = [];

            for (let i = 0; i < 256; i++) {
                chars.push(String.fromCharCode(i));
            }

            let input = chars.join(''),
                compressed = compress(input);

            expect(decompress(compressed)).toBe(input);
        });
    });

    describe('compression ratio', () => {
        it('1KB repetitive JSON compresses to < 50%', () => {
            let items: Record<string, unknown>[] = [];

            for (let i = 0; i < 50; i++) {
                items.push({
                    active: true,
                    name: 'test_user',
                    role: 'admin',
                    score: 100
                });
            }

            let input = JSON.stringify(items),
                compressed = compress(input);

            expect(input.length).toBeGreaterThan(1024);
            expect(compressed.length).toBeLessThan(input.length * 0.5);
            expect(decompress(compressed)).toBe(input);
        });
    });

    describe('edge cases', () => {
        it('two character string', () => {
            let compressed = compress('ab');

            expect(decompress(compressed)).toBe('ab');
        });

        it('three character string', () => {
            let compressed = compress('abc');

            expect(decompress(compressed)).toBe('abc');
        });

        it('string with only whitespace', () => {
            let input = '   \t\n\r  ',
                compressed = compress(input);

            expect(decompress(compressed)).toBe(input);
        });

        it('string with newlines', () => {
            let input = 'line1\nline2\nline3\n',
                compressed = compress(input);

            expect(decompress(compressed)).toBe(input);
        });

        it('compressed output contains no null bytes', () => {
            let inputs = [
                'hello world',
                'abc'.repeat(500),
                JSON.stringify({ key: 'value' }),
                '日本語テスト'
            ];

            for (let i = 0, n = inputs.length; i < n; i++) {
                let compressed = compress(inputs[i]);

                for (let j = 0, m = compressed.length; j < m; j++) {
                    expect(compressed.charCodeAt(j)).not.toBe(0);
                }
            }
        });

        it('binary-like string with high char codes', () => {
            let chars: string[] = [];

            for (let i = 0; i < 100; i++) {
                chars.push(String.fromCharCode(Math.floor(Math.random() * 65535) + 1));
            }

            let input = chars.join(''),
                compressed = compress(input);

            expect(decompress(compressed)).toBe(input);
        });
    });

    describe('boundary cases', () => {
        it('very large string (~100KB) round-trips', () => {
            let items: Record<string, unknown>[] = [];

            for (let i = 0; i < 2000; i++) {
                items.push({
                    data: 'x'.repeat(10),
                    id: i,
                    name: `entry_${i}`,
                    value: i * 3.14
                });
            }

            let input = JSON.stringify(items);

            expect(input.length).toBeGreaterThan(100_000);

            let compressed = compress(input);

            expect(decompress(compressed)).toBe(input);
        });

        it('high-entropy string that does not compress well', () => {
            let chars: string[] = [];

            for (let i = 0; i < 500; i++) {
                chars.push(String.fromCharCode(32 + (((i * 7) + (i * i * 3)) % 95)));
            }

            let input = chars.join(''),
                compressed = compress(input);

            expect(decompress(compressed)).toBe(input);
        });

        it('exact bit-width boundary (2-bit to 3-bit transition)', () => {
            // dictSize starts at 3, numBits at 2. After 2 new dictionary entries
            // dictSize=5 > (1<<2)=4, triggering numBits bump to 3.
            // 'abcd' has 4 unique chars; pattern 'abcdabcd' creates entries:
            //   'ab'->3 (dictSize=4), 'bc'->4 (dictSize=5, triggers 2->3 bit transition)
            let input = 'abcdabcd',
                compressed = compress(input);

            expect(decompress(compressed)).toBe(input);
        });

        it('single char repeated 2 times', () => {
            let compressed = compress('aa');

            expect(decompress(compressed)).toBe('aa');
        });

        it('single char repeated 3 times', () => {
            let compressed = compress('aaa');

            expect(decompress(compressed)).toBe('aaa');
        });

        it('single char repeated 4 times', () => {
            let compressed = compress('aaaa');

            expect(decompress(compressed)).toBe('aaaa');
        });

        it('surrogate pairs (mathematical bold fraktur)', () => {
            let input = '𝕳𝖊𝖑𝖑𝖔',
                compressed = compress(input);

            expect(decompress(compressed)).toBe(input);
        });
    });

    describe('error handling', () => {
        it('throws on truncated compressed input', () => {
            let compressed = compress('hello world this is a test string'),
                truncated = compressed.substring(0, Math.floor(compressed.length / 2));

            expect(() => decompress(truncated)).toThrow('LZ: unexpected end of compressed data');
        });

        it('throws on invalid decompression code', () => {
            // Craft a compressed string with a valid header followed by an invalid code:
            // Start with a valid literal (code=0, 8-bit char 'a'=97), then inject a code
            // value that exceeds the current dictionary size.
            // At that point: dictSize=4, numBits=2, valid codes: 0,1,2,3
            // We need a code >= 4 which is impossible in 2 bits, so we need to grow
            // the dictionary first. Instead, use a real compressed stream and corrupt it.
            let compressed = compress('abcdefghijklmnop'),
                chars = [...compressed.slice(0, -1)];

            // Corrupt a middle byte to inject invalid codes
            if (chars.length > 3) {
                chars[2] = String.fromCharCode(chars[2].charCodeAt(0) ^ 0x7F);
            }

            let corrupted = chars.join('') + compressed[compressed.length - 1];

            expect(() => decompress(corrupted)).toThrow();
        });

        it('throws when decompressed output exceeds size limit', () => {
            // Use a moderately sized repetitive input that compresses quickly
            // but decompresses to >10MB by building a string just over the limit
            let chunk = 'abcdef'.repeat(100),
                input = chunk.repeat(Math.ceil(10_485_761 / chunk.length) + 1);

            let compressed = compress(input);

            expect(() => decompress(compressed)).toThrow('LZ: decompressed output exceeds size limit');
        }, 60000);

        it('100KB repeated data round-trips without triggering size limit', () => {
            let input = 'a'.repeat(100_000),
                compressed = compress(input);

            expect(decompress(compressed)).toBe(input);
        });
    });
});
