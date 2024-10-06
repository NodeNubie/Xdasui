
import suidouble from 'suidouble';
import { bcs } from '@mysten/sui/bcs';
import hasher from 'js-sha3';
import nodeCrypto from 'crypto';

import { bytesTou64, bigIntTo32Bytes } from './math.js';
import NonceFinder from './NonceFinder.js';

export default class Miner {
    constructor(params = {}) {
        this._suiMaster = params.suiMaster || null;

        this._treasuryId = params.treasuryId || null;
        this._blockStoreId = params.blockStoreId || null;
        this._packageId = params.packageId || null;

        this._blockStore = null; // to be initialized as SuiObject in .checkObjects() initializer
        this._treasury = null;
        this._movePackage = null;

        this._nonceFinder = new NonceFinder({ name: 'META' });
    }

    async checkObjects() {
        if (this.__checkObjectsPromise) {
            return await this.__checkObjectsPromise;
        }

        this.__checkObjectsPromiseResolver = null; // to be sure it's executed once async
        this.__checkObjectsPromise = new Promise((res)=>{ this.__checkObjectsPromiseResolver = res; });

        if (!this._blockStoreId || !this._treasuryId || !this._packageId) {
            throw new Error('blockStoreId, packageId and treasuryId are required');
        }

        const SuiObject = suidouble.SuiObject;
        
        const blockStore = new SuiObject({
            id: this._blockStoreId,
            suiMaster: this._suiMaster,
        });
        const treasury = new SuiObject({
            id: this._treasuryId,
            suiMaster: this._suiMaster,
        });
        this._suiMaster.objectStorage.push(blockStore);
        this._suiMaster.objectStorage.push(treasury);
        await blockStore.fetchFields(); // get fields from the blockchain
        await treasury.fetchFields(); // get fields from the blockchain

        this._blockStore = blockStore;
        this._treasury = treasury;

        const movePackage = this._suiMaster.addPackage({
            id: this._packageId,
        });
        await movePackage.isOnChain(); // check the package on the blockchain

        this._movePackage = movePackage;

        this.__checkObjectsPromiseResolver(true); // initialized

        return true;
    }

    async getBTCBalance() {
        await this.checkObjects();

        const balance = await this._suiMaster.getBalance(''+this._packageId+'::meta::META');
        return balance;
    }

    async mine(startNonce = 0, meta = null, payload = null) {
        await this.checkObjects();

        if (!meta) {
            meta = new Uint8Array([]);
        }
        if (!payload) {
            payload = new Uint8Array(256);
            const bytes = nodeCrypto.randomBytes(payload.length);
            payload.set(bytes);
        }

        meta = new Uint8Array(meta);
        payload = new Uint8Array(payload);

        let blockInfo = await this.getBlockInfo();
        let foundValid = false;
        let preparedHash = this.prepareHash(blockInfo, meta, payload);
        let nonce = startNonce || 0;
        const startFindingNonceAt = (new Date()).getTime();

        let isOutdated = false;
        const __checkForOutdatedInterval = setInterval(()=>{
            try {
                this.hasBlockInfoChanged(blockInfo)
                    .then((changed)=>{
                        console.log('META | block hash changed', changed);
                        if (changed) {
                            isOutdated = true;
                            this._nonceFinder.pleaseStop();
                        }
                    })
                    .catch((e)=>{
                        console.error(e);
                    });
            } catch (e) {
                console.log(e);
            }
        }, 3000);

        while (!foundValid && !isOutdated) {
            // nonce = await this.findValidNonce(preparedHash, blockInfo.difficulty, nonce);

            nonce = await this._nonceFinder.findValidNonce(preparedHash, blockInfo.target);

            if (nonce !== null) {
                console.log('META | valid nonce '+nonce+' found in '+((new Date()).getTime() - startFindingNonceAt)+'ms');
                const success = await this.submit(nonce, meta, payload);
                if (success) {
                    foundValid = true;
                } else {
                    console.log('META | blockInfo was wrong!!!');
                    nonce = nonce + 1;
                    blockInfo = await this.getBlockInfo(); // maybe we have wrong block info?
                    preparedHash = this.prepareHash(blockInfo, meta, payload);
                }
            } else {
                // asked to stop 
                isOutdated = true;
            }

        };

        clearInterval(__checkForOutdatedInterval);

        return true;
    }

    async submit(nonce, meta = null, payload = null) {
        await this.checkObjects();

        if (!meta) {
            meta = new Uint8Array([]);
        }
        if (!payload) {
            payload = new Uint8Array([]);
        }

        const tx = new suidouble.Transaction();

        const args = [
            tx.object('0x0000000000000000000000000000000000000000000000000000000000000006'), // clock
            tx.object('0x0000000000000000000000000000000000000000000000000000000000000008'), // random
            tx.object(this._blockStore.id),
            tx.object(this._treasury.id),
            suidouble.txInput(tx, 'vector<u8>', Array.from(meta)),
            suidouble.txInput(tx, 'vector<u8>', Array.from(payload)),
            suidouble.txInput(tx, 'u64', nonce),
            tx.object(this._suiMaster.address),
        ];

        tx.moveCall({
            target: `${this._packageId}::mining::mint`,
            arguments: args
        });

        try {
            const r = await this._suiMaster.signAndExecuteTransaction({ 
                transaction: tx, 
                requestType: 'WaitForLocalExecution',
                sender: this._suiMaster.address, 
                options: {
                    "showEffects": true, // @todo: remove?
                    "showEvents": true, // @todo: remove?
                    "showObjectChanges": true,
                    showType: true,
                    showContent: true,
                    showOwner: true,
                    showDisplay: true,
                },
            });
    
            if (r && r.effects && r.effects.status && r.effects.status.status && r.effects.status.status == 'success') {
                console.log('META | valid nonce submited');
                return true;
            } else {
                console.log('META | can not submit nonce');
            }
        } catch (e) {
            console.log('META | can not submit nonce');
            console.error(e);
        }

        return false;
    }

    async printAdjustDifficultyEvents() {
        await this.checkObjects();

        const events = await this.getAdjustDifficultyEvents();
        console.log('------------');
        for (let i = 0; i < events.length; i++) {
            const event = events[i];

            console.log('DifficultyEvent, was: '+event.parsedJson.previous_time+'ms per block at height: '+event.parsedJson.height);

            let targetAsHex = BigInt(event.parsedJson.target).toString(16);
            while (targetAsHex.length < 64) { 
                targetAsHex = '0' + targetAsHex;
            }

            console.log('adjusted to: '+targetAsHex );

            if (events[i+1]) {
                const previousEvent = events[i+1];
                const target = BigInt(event.parsedJson.target);
                const previousTarget = BigInt(previousEvent.parsedJson.target);

                if (target > previousTarget) {
                    const increase = (target - previousTarget);
                    const percentage = (increase * 100n / previousTarget);

                    let increaseAsString = increase.toString(16);
                    while (increaseAsString.length < 64) {  increaseAsString = '0' + increaseAsString; }

                    console.log('Target Increased by '+increaseAsString);
                    console.log('Trying to make it '+Number(percentage)+'% easier to mine');
                } else {
                    const decrease = (previousTarget - target);
                    const percentage = (decrease * 100n / previousTarget);

                    let decreaseAsString = decrease.toString(16);
                    while (decreaseAsString.length < 64) {  decreaseAsString = '0' + decreaseAsString; }

                    console.log('Target Decreased by '+decreaseAsString);
                    console.log('Trying to make it '+Number(percentage)+'% harder to mine');
                }

            }
            
            console.log('------------');
        }
    }

    async getAdjustDifficultyEvents() {
        await this.checkObjects();

        const ret = [];
        const paginated = await this._movePackage.modules.mining.fetchEvents({
            eventTypeName: 'DifficultyAdjusted',
        });
        await paginated.forEach((suiEvent)=>{
            ret.push(suiEvent);
        });
        return ret;
    }

    async hasBlockInfoChanged(blockInfo) {
        const currentBlockInfo = await this.getBlockInfo();
        // console.log('Current previous_hash: '+currentBlockInfo.previousHashAsBigInt);
        if (currentBlockInfo.previousHashAsBigInt != blockInfo.previousHashAsBigInt) {
            return true;
        }
        return false;
    }

    async getBlockInfo() {
        await this.checkObjects();

        const tx = new suidouble.Transaction();

        tx.moveCall({
            sender: this._suiMaster.address,
            target: `${this._packageId}::mining::get_block_info`,
            arguments: [ tx.object(this._blockStore.id) ],
            // typeArguments: [`${testScenario._packages.admin.address}::mining::BlockInfo`],
        });

        try {
            const r = await this._suiMaster.client.devInspectTransactionBlock({ 
                    transactionBlock: tx, 
                    sender: this._suiMaster.address 
                });
            const valueData = Uint8Array.from(r.results[0].returnValues[0][0]);
            const BlockInfo = bcs.struct('BlockInfo', {
                previous_hash: bcs.vector(bcs.u8()),
                salt: bcs.u64(),
                target: bcs.u256(),
            });
            const blockInfo = BlockInfo.parse(valueData);

            blockInfo.salt = BigInt(blockInfo.salt);
            blockInfo.target = BigInt(blockInfo.target);
            blockInfo.previousHashAsBigInt = bytesTou64(blockInfo.previous_hash);

            return blockInfo;
        } catch (e) {
            console.error(e);
        }

        return null;
    }

    async getMostRecentBlock() {
        await this.checkObjects();

        let suiEvent = null;
        const paginated = await this._movePackage.modules.mining.fetchEvents({
            eventTypeName: 'BlockMinted',
        });
        await paginated.forEach((retEvent)=>{
            suiEvent = retEvent;
        }, 1);
        if (!suiEvent) {
            return null;
        }

        const blockHeight = suiEvent.parsedJson.height;

        const tx = new suidouble.Transaction();

        tx.moveCall({
            sender: this._suiMaster.address,
            target: `${this._packageId}::mining::borrow_block_by_height`,
            arguments: [ 
                tx.object(this._blockStore.id), 
                suidouble.txInput(tx, 'u64', blockHeight),
            ],
            // typeArguments: [`${testScenario._packages.admin.address}::mining::BlockInfo`],
        });

        try {
            const r = await this._suiMaster.client.devInspectTransactionBlock({ 
                    transactionBlock: tx, 
                    sender: this._suiMaster.address 
                });
            // console.log(r.results[0].returnValues);
            const valueData = Uint8Array.from(r.results[0].returnValues[0][0]);
            const Block = bcs.struct('Block', {
                id: bcs.u256(),
                previous_hash: bcs.vector(bcs.u8()),
                salt: bcs.u64(),
                meta: bcs.vector(bcs.u8()),
                payload: bcs.vector(bcs.u8()),
                /// .. few more we don't care about
            });
            const block = Block.parse(valueData);

            return block;
        } catch (e) {
            console.error(e);
        }

        return null;
    }

    prepareHash(blockInfo, meta, payload) {
        const saltBytes = bcs.u64().serialize(blockInfo.salt).toBytes();
        const toHash1Length = blockInfo.previous_hash.length + saltBytes.length + meta.length + payload.length;
        const toHash1 = new Uint8Array(toHash1Length);

        toHash1.set(blockInfo.previous_hash, 0);
        toHash1.set(saltBytes, blockInfo.previous_hash.length);
        toHash1.set(meta, blockInfo.previous_hash.length + saltBytes.length);
        toHash1.set(payload, blockInfo.previous_hash.length + saltBytes.length + meta.length);

        const hash1 = bigIntTo32Bytes(BigInt('0x'+hasher.keccak256(toHash1)));

        return hash1;
    }
}