## CLI Miner for META and FOMO PoW on the Sui Blockchain

- [Meta](https://github.com/suidouble/sui_meta) is the PoW coin on the Sui blockchain
- [Web Miner](https://suimine.xyz/) for the FOMO token
- [Follow me on X](https://x.com/suidouble)
- CLI Miner:

CLI miner expects you to have node.js installed of version >= 18 [node.js](https://nodejs.org/en/download/package-manager)

```
git clone https://github.com/suidouble/sui_meta_miner.git
cd sui_meta_miner
npm install
```

#### Run it

Miner supports both META and FOMO coins:

```
node mine.js --meta --chain=mainnet --phrase="secretphrase"
node mine.js --fomo --chain=mainnet --phrase="secretphrase"
```

or you can run it in the boss mode, mining both:

```
node mine.js --fomo --meta --chain=mainnet --phrase="secretphrase"

```

Where secretphrase is 24 words secret phrase for your wallet private key or private key in the format of "suiprivkey1....." ( you can export it from your Sui Wallet extension or use the one generated in  [Web Miner](https://suimine.xyz/) )

Be sure you have some SUI in your wallet for the gas, 1 SUI is enough for submiting many hashes.

## License

Apache

**Please open-source your fork**
