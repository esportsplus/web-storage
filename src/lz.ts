type CompressCtx = { bitsInBuffer: number; buffer: number; numBits: number; output: number[] };
type DecompressCtx = { bitPos: number; compressed: string; currentValue: number; pos: number };


function emitLiteral(ctx: CompressCtx, ch: string) {
    let code = ch.charCodeAt(0);

    if (code < 256) {
        writeBits(ctx, ctx.numBits, 0);
        writeBits(ctx, 8, code);
    }
    else {
        writeBits(ctx, ctx.numBits, 1);
        writeBits(ctx, 16, code);
    }
}

function readBits(ctx: DecompressCtx, n: number): number {
    let result = 0;

    for (let i = 0; i < n; i++) {
        if (ctx.bitPos > 15) {
            ctx.currentValue = ctx.compressed.charCodeAt(ctx.pos++) - 1;
            ctx.bitPos = 0;
        }

        result = (result << 1) | ((ctx.currentValue >> (15 - ctx.bitPos)) & 1);
        ctx.bitPos++;
    }

    return result;
}

function writeBits(ctx: CompressCtx, n: number, value: number) {
    for (let i = n - 1; i >= 0; i--) {
        ctx.buffer = (ctx.buffer << 1) | ((value >> i) & 1);
        ctx.bitsInBuffer++;

        if (ctx.bitsInBuffer === 16) {
            ctx.output.push(ctx.buffer + 1);
            ctx.buffer = 0;
            ctx.bitsInBuffer = 0;
        }
    }
}


const compress = (input: string): string => {
    if (!input) {
        return '';
    }

    let ctx: CompressCtx = { bitsInBuffer: 0, buffer: 0, numBits: 2, output: [] },
        dictSize = 3,
        dictionary = new Map<string, number>(),
        w = '';

    for (let i = 0, n = input.length; i < n; i++) {
        let c = input[i],
            wc = w + c;

        if (dictionary.has(wc)) {
            w = wc;
            continue;
        }

        if (w.length > 0) {
            if (dictionary.has(w)) {
                writeBits(ctx, ctx.numBits, dictionary.get(w)!);
            }
            else {
                emitLiteral(ctx, w);
            }

            dictionary.set(wc, dictSize++);

            if (dictSize > (1 << ctx.numBits)) {
                ctx.numBits++;
            }
        }

        w = c;
    }

    if (w.length > 0) {
        if (dictionary.has(w)) {
            writeBits(ctx, ctx.numBits, dictionary.get(w)!);
        }
        else {
            emitLiteral(ctx, w);
        }
    }

    // Trailing dict advance: ensures the decompressor's last placeholder growth
    // matches (the decompressor will push a placeholder before reading EOF)
    dictSize++;

    if (dictSize > (1 << ctx.numBits)) {
        ctx.numBits++;
    }

    writeBits(ctx, ctx.numBits, 2);

    if (ctx.bitsInBuffer > 0) {
        ctx.output.push(((ctx.buffer << (16 - ctx.bitsInBuffer)) & 0xFFFF) + 1);
    }

    ctx.output.push((ctx.bitsInBuffer === 0 ? 16 : ctx.bitsInBuffer) + 1);

    let chars: string[] = [];

    for (let i = 0, n = ctx.output.length; i < n; i++) {
        chars.push(String.fromCharCode(ctx.output[i]));
    }

    return chars.join('');
};

const decompress = (compressed: string): string => {
    if (!compressed) {
        return '';
    }

    let ctx: DecompressCtx = { bitPos: 16, compressed: '', currentValue: 0, pos: 0 },
        dictSize = 3,
        dictionary: string[] = [],
        numBits = 2;

    ctx.compressed = compressed.substring(0, compressed.length - 1);

    let code = readBits(ctx, numBits),
        entry: string;

    if (code === 0) {
        entry = String.fromCharCode(readBits(ctx, 8));
    }
    else if (code === 1) {
        entry = String.fromCharCode(readBits(ctx, 16));
    }
    else {
        return '';
    }

    let result: string[] = [entry],
        w = entry;

    while (true) {
        // Reserve dict slot BEFORE reading (matches compressor's add-before-next-emit timing)
        let slotIdx = dictionary.length;

        dictionary.push('');
        dictSize++;

        if (dictSize > (1 << numBits)) {
            numBits++;
        }

        code = readBits(ctx, numBits);

        if (code === 2) {
            dictionary.pop();
            break;
        }

        let slotCode = slotIdx + 3;

        if (code === 0) {
            entry = String.fromCharCode(readBits(ctx, 8));
        }
        else if (code === 1) {
            entry = String.fromCharCode(readBits(ctx, 16));
        }
        else if (code === slotCode) {
            entry = w + w[0];
        }
        else if (code >= 3 && code < slotCode) {
            entry = dictionary[code - 3];
        }
        else {
            throw new Error('LZ: invalid decompression code');
        }

        dictionary[slotIdx] = w + entry[0];
        result.push(entry);
        w = entry;
    }

    return result.join('');
};


export { compress, decompress };
