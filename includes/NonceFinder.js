import { spawn, Thread, Worker } from "threads";

export default class NonceFinder {
    constructor(params = {}) {
        this._workers = [];
        this._noncesPerRun = 100000;
        this._tryingNonces = [];
        this._initialNonce = 0;
        this._startedSearchAt = null;
        this._workersCount = 8;

        this._askedToStop = false;

        this._name = params.name;
    }

    pleaseStop() {
        this._askedToStop = true;
    }

    getNextNonceToTry() {
        if (this._tryingNonces.length) {
            return this._tryingNonces[this._tryingNonces.length - 1] + this._noncesPerRun;
        }
        return this._initialNonce; // Math.floor( 1199254740991*Math.random() );
    }

    hashesPerSecond() {
        if (!this._startedSearchAt) {
            return 0;
        }
        const diff = (new Date()).getTime() - this._startedSearchAt;

        return Math.floor( (this.getNextNonceToTry() - this._initialNonce) / (diff / 1000) );
    }

    async addWorker() {
        const worker = await spawn(new Worker("./ThreadWorker.js"));
        this._workers.push(worker);
    }

    async initWorkers() {
        while (this._workers.length < this._workersCount) {
            await this.addWorker();
        };
    }

    async findValidNonce(preparedHash, maxTarget) {
        this._askedToStop = false;
        await this.initWorkers();
        this._startedSearchAt = (new Date()).getTime();
        this._tryingNonces = [];
        this._initialNonce = Math.floor( 1199254740991*Math.random() );

        const promises = [];

        let foundGoodHash = false;
        do {
            let i = 0;
            for (const worker of this._workers) {
                const tryNonce = this.getNextNonceToTry();
                // console.log('thread #'+i+' | trying nonce: ', tryNonce);
                const promise = new Promise((res,rej)=>{
                    worker.findSalt(preparedHash, maxTarget, tryNonce)
                        .then((foundNonce)=>{
                            if (foundNonce !== null) {
                                res(foundNonce);
                            } else {
                                rej();
                            }
                        });
                });
                this._tryingNonces.push(tryNonce);
                promises.push(promise);
                i++;
            }
            try {
                const anyNonce = await Promise.any(promises);
                if (anyNonce) {
                    foundGoodHash = true;
                    return Number(anyNonce);
                }
            } catch (e) {
                foundGoodHash = false;
            }
            console.log((this._name ? this._name : '') + ' | current rate is: '+this.hashesPerSecond()+' H/s');
        } while (!foundGoodHash && !this._askedToStop);

        if (this._askedToStop) {  // we are stoping once
            console.log((this._name ? this._name : '') + ' | goes to the next nonces block');
            this._askedToStop = false;
        }

        return null;
    }
}