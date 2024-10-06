'use strict'

import t from 'tap';
const { test } = t;
import { bcs } from '@mysten/sui/bcs';

import { 
    incrementBytes,
    bytesTou64,
    u64toBytes, } from '../includes/math.js';


test('basic', async t => {

    const numberToUint8Array = u64toBytes(0);
    t.equal(numberToUint8Array.length, 8);

    const numberToUint8Array2 = u64toBytes(1n);
    t.equal(numberToUint8Array2.length, 8);


    t.equal(bytesTou64(numberToUint8Array), 0n);
    t.equal(bytesTou64(numberToUint8Array2), 1n);

    incrementBytes(numberToUint8Array);
    incrementBytes(numberToUint8Array2);

    t.equal(bytesTou64(numberToUint8Array), 1n);
    t.equal(bytesTou64(numberToUint8Array2), 2n);


    const numberToUint8Array3 = u64toBytes(255n);
    t.equal(bytesTou64(numberToUint8Array3), 255n);
    incrementBytes(numberToUint8Array3);
    t.equal(bytesTou64(numberToUint8Array3), 256n);
    t.equal(numberToUint8Array3.length, 8);

    console.log(numberToUint8Array3);
    console.log(bcs.u64().serialize(256).toBytes());
});