import type { Data } from './types';
import compressor from 'browser-image-compression';
import * as IPFS from 'ipfs-core';


let node: any;


// TODO: Enable custom IPFS host connections
async function connect(): Promise<void> {
    if (node) {
        return;
    }

    node = await IPFS.create();
};


const upload = async (data: Data, compress?: boolean): Promise<string> => {
    let cid: string = '';

    await connect();

    if (Array.isArray(data)) {
        for await (const item of node.addAll(data, {
            pin: true,
            wrapWithDirectory: true
        })) {
            if (item.path) {
                continue;
            }

            cid = item.cid.toString();
        }
    }
    else {
        if (data instanceof File) {
            if (data.type.startsWith('image') && compress) {
                data = await compressor(data, { useWebWorker: true });
            }

            data = await data.text();
        }

        cid = ( await node.add(data) ).cid.toString();
    }

    return `ipfs://${cid}`;
};

const uploadable = (value: any): boolean => {
    let valid = false;

    if (value instanceof File) {
        valid = true;
    }
    else if (typeof value === 'object' && value !== null) {
        valid = 'content' in value;
    }
    else if (Array.isArray(value)) {
        for (let i = 0, n = value.length; i < n; i++) {
            valid = uploadable(value[i]);

            if (!valid) {
                break;
            }
        }
    }

    return valid;
};


export default { upload, uploadable };
