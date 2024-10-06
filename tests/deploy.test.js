'use strict'

// const t = require('tap');

import path from 'path';
import t from 'tap';
import suidouble from 'suidouble';
const { test } = t;
import Miner from '../includes/Miner.js';
import config from '../config.js';

let testScenario = null;

const getMiner = () => {
    const blockStore = testScenario.takeShared('BlockStore');
    const treasury = testScenario.takeShared('Treasury');

    const miner = new Miner({
        suiMaster: testScenario._masters.admin,
        packageId: testScenario._packages.admin.address,
        blockStoreId: blockStore.id,
        treasuryId: treasury.id,
    });

    return miner;
};

test('initialization', async t => {
    testScenario = new suidouble.SuiTestScenario({
        path: config.packagePath,
        debug: true,
    });
    await testScenario.begin('admin');
    await testScenario.init();

    t.equal(testScenario.currentAs, 'admin');
});

test('init_genesis', async t => {
    await testScenario.nextTx('admin', async()=>{
        const clockId = '0x0000000000000000000000000000000000000000000000000000000000000006';
        const blockStore = testScenario.takeShared('BlockStore');
        await testScenario.moveCall('mining', 'init_genesis', [clockId, blockStore.id]);
    });
});

test('mine_a_block', async t => {
    const miner = getMiner();
    const success = await miner.mine();

    t.ok(success);
});

test('check_that_balance_increased_on_mine', async t => {
    const miner = getMiner();
    const balanceBefore = await miner.getBTCBalance();

    await miner.mine();

    const balanceAfter = await miner.getBTCBalance();

    t.ok(balanceAfter > balanceBefore);

    const rewardAmount = balanceAfter - balanceBefore;

    t.equal(rewardAmount, 50000000000n);
});


test('mine_few_blocks', async t => {
    const miner = getMiner();

    for (let i = 0; i < 10; i++) {
        const success = await miner.mine();
        t.ok(success);
    }
});

test('mine_few_blocks_meta_and_payload', async t => {
    const miner = getMiner();

    for (let i = 0; i < 10; i++) {
        const randomMeta = Array.from({length: 100}, () => Math.floor(Math.random() * 255));
        const randomPayload = Array.from({length: 100}, () => Math.floor(Math.random() * 255));

        const success = await miner.mine(0, new Int8Array(randomMeta), new Int8Array(randomPayload));
        t.ok(success);

        const mostRecentBlock = await miner.getMostRecentBlock();

        t.same(mostRecentBlock.meta, randomMeta);
        t.same(mostRecentBlock.payload, randomPayload);
    }
});

test('finishing the test scenario', async t => {
    await testScenario.end();
});
