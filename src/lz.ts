type CompressCtx = { bitsInBuffer: number; buffer: number; numBits: number; output: number[] };
type DecompressCtx = { bitPos: number; compressed: string; currentValue: number; pos: number };


let CHUNK = 8192;
let MAX_DECOMPRESSED_SIZE = 10_485_760;


function emitLiteralCode(ctx: CompressCtx, code: number) {
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

    while (n > 0) {
        if (ctx.bitPos > 15) {
            if (ctx.pos >= ctx.compressed.length) {
                throw new Error('LZ: unexpected end of compressed data');
            }

            ctx.currentValue = ctx.compressed.charCodeAt(ctx.pos++) - 1;
            ctx.bitPos = 0;
        }

        let take = 16 - ctx.bitPos;

        if (take > n) {
            take = n;
        }

        result = (result << take) | ((ctx.currentValue >> (16 - ctx.bitPos - take)) & ((1 << take) - 1));
        ctx.bitPos += take;
        n -= take;
    }

    return result;
}

function toStringChunked(output: number[]): string {
    let n = output.length;

    if (n <= CHUNK) {
        return String.fromCharCode(...output);
    }

    let parts: string[] = [];

    for (let i = 0; i < n; i += CHUNK) {
        parts.push(String.fromCharCode(...output.slice(i, i + CHUNK)));
    }

    return parts.join('');
}

function writeBits(ctx: CompressCtx, n: number, value: number) {
    while (n > 0) {
        let take = 16 - ctx.bitsInBuffer;

        if (take > n) {
            take = n;
        }

        ctx.buffer = (ctx.buffer << take) | ((value >> (n - take)) & ((1 << take) - 1));
        ctx.bitsInBuffer += take;
        n -= take;

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

    // Dictionary keyed by numeric composite wKey * 65536 + charCode (exact in float64):
    // wKey is the char code (0..65535) when w is a single char, else 65536 + dictCode for a
    // dictionary entry. Ranges never overlap, so (wKey, cCode) uniquely identifies the string w + c.
    let ctx: CompressCtx = { bitsInBuffer: 0, buffer: 0, numBits: 2, output: [] },
        dictSize = 3,
        dictionary = new Map<number, number>(),
        wCode = -1,
        wKey = input.charCodeAt(0);

    for (let i = 1, n = input.length; i < n; i++) {
        let cCode = input.charCodeAt(i),
            composite = wKey * 65536 + cCode,
            hit = dictionary.get(composite);

        if (hit !== undefined) {
            wCode = hit;
            wKey = 65536 + hit;
            continue;
        }

        if (wCode >= 0) {
            writeBits(ctx, ctx.numBits, wCode);
        }
        else {
            emitLiteralCode(ctx, wKey);
        }

        dictionary.set(composite, dictSize++);

        if (dictSize > (1 << ctx.numBits)) {
            ctx.numBits++;
        }

        wCode = -1;
        wKey = cCode;
    }

    if (wCode >= 0) {
        writeBits(ctx, ctx.numBits, wCode);
    }
    else {
        emitLiteralCode(ctx, wKey);
    }

    // Trailing dict advance mirrors the decompressor's placeholder growth before it reads EOF.
    dictSize++;

    if (dictSize > (1 << ctx.numBits)) {
        ctx.numBits++;
    }

    writeBits(ctx, ctx.numBits, 2);

    if (ctx.bitsInBuffer > 0) {
        ctx.output.push(((ctx.buffer << (16 - ctx.bitsInBuffer)) & 0xFFFF) + 1);
    }

    ctx.output.push((ctx.bitsInBuffer === 0 ? 16 : ctx.bitsInBuffer) + 1);

    return toStringChunked(ctx.output);
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

    let parts: string[] = [entry],
        totalLength = entry.length,
        w = entry;

    while (true) {
        // Reserve the dict slot before reading, matching the compressor's add-before-next-emit timing.
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
        parts.push(entry);
        totalLength += entry.length;

        if (totalLength > MAX_DECOMPRESSED_SIZE) {
            throw new Error('LZ: decompressed output exceeds size limit');
        }

        w = entry;
    }

    return parts.join('');
};


export { compress, decompress };
