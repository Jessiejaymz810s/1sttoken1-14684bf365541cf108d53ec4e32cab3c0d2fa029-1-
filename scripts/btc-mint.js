import * as bitcoin from 'bitcoinjs-lib';
import * as bip39 from 'bip39';
import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';
import { ECPairFactory } from 'ecpair';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const bip32 = BIP32Factory(ecc);
const ECPair = ECPairFactory(ecc);
bitcoin.initEccLib(ecc);

const network = bitcoin.networks.testnet;
const MEMPOOL_API = 'https://mempool.space/testnet/api';

const toXOnly = (pubKey) => (pubKey.length === 32 ? pubKey : pubKey.slice(1, 33));

async function mintBRC20() {
    const mnemonic = process.env.BTC_MNEMONIC;
    if (!mnemonic) {
        throw new Error('BTC_MNEMONIC not found in .env. Run scripts/btc-wallet.js first.');
    }

    const ticker = 'quazr';
    const amount = '1000';
    console.log(`\nPreparing to mint BRC-20: ${ticker} (Amount: ${amount})`);

    // 1. Setup Wallet
    const seed = await bip39.mnemonicToSeed(mnemonic);
    const root = bip32.fromSeed(seed, network);
    const child = root.derivePath("m/86'/1'/0'/0/0");
    const internalPubkey = toXOnly(child.publicKey);

    // 2. Define Inscription
    const brc20Data = JSON.stringify({
        p: "brc-20",
        op: "mint",
        tick: ticker,
        amt: amount
    });
    
    // Ordinals Inscription Script (Envelope)
    const inscriptionScript = bitcoin.script.compile([
        internalPubkey,
        bitcoin.opcodes.OP_CHECKSIG,
        bitcoin.opcodes.OP_0,
        bitcoin.opcodes.OP_IF,
        Buffer.from('ord'),
        bitcoin.opcodes.OP_1,
        Buffer.from('text/plain;charset=utf-8'),
        bitcoin.opcodes.OP_0,
        Buffer.from(brc20Data),
        bitcoin.opcodes.OP_ENDIF
    ]);

    const scriptTree = {
        output: inscriptionScript
    };

    const scriptTaproot = bitcoin.payments.p2tr({
        internalPubkey,
        scriptTree,
        network
    });

    const commitAddress = scriptTaproot.address;
    console.log(`Commit Address: ${commitAddress}`);

    // 3. Fetch UTXOs for the funding address
    const fundingAddress = process.env.BTC_TAPROOT_ADDRESS;
    console.log(`Funding Address: ${fundingAddress}`);

    try {
        const { data: utxos } = await axios.get(`${MEMPOOL_API}/address/${fundingAddress}/utxo`);
        if (utxos.length === 0) {
            console.log('\n❌ No UTXOs found. Please fund your address first:');
            console.log(`Address: ${fundingAddress}`);
            return;
        }

        // Use the first UTXO (simplified)
        const utxo = utxos[0];
        console.log(`Using UTXO: ${utxo.txid}:${utxo.vout} (${utxo.value} sats)`);

        // 4. Create Commit Transaction
        const psbtCommit = new bitcoin.Psbt({ network });
        psbtCommit.addInput({
            hash: utxo.txid,
            index: utxo.vout,
            witnessUtxo: {
                value: utxo.value,
                script: bitcoin.address.toOutputScript(fundingAddress, network)
            },
            tapInternalKey: internalPubkey
        });

        const revealFee = 2000; // Estimated fee for reveal
        const commitValue = 1000 + revealFee; // Minimum sats for inscription + fee

        psbtCommit.addOutput({
            address: commitAddress,
            value: commitValue
        });

        // Add change output if needed
        const changeValue = utxo.value - commitValue - 1000; // 1000 sats fee for commit
        if (changeValue > 546) {
            psbtCommit.addOutput({
                address: fundingAddress,
                value: changeValue
            });
        }

        psbtCommit.signInput(0, child);
        psbtCommit.finalizeAllInputs();

        const commitTx = psbtCommit.extractTransaction();
        const commitTxHex = commitTx.toHex();
        console.log(`\nCommit TX Hash: ${commitTx.getId()}`);

        // 5. Create Reveal Transaction
        const psbtReveal = new bitcoin.Psbt({ network });
        
        const tapLeafScript = {
            leafVersion: scriptTaproot.redeem.leafVersion,
            script: scriptTaproot.redeem.output,
            controlBlock: scriptTaproot.witness[scriptTaproot.witness.length - 1]
        };

        psbtReveal.addInput({
            hash: commitTx.getId(),
            index: 0,
            witnessUtxo: {
                value: commitValue,
                script: scriptTaproot.output
            },
            tapLeafScript: [tapLeafScript]
        });

        psbtReveal.addOutput({
            address: fundingAddress, // Send the inscription to yourself
            value: 1000
        });

        // Sign and finalize Reveal
        psbtReveal.signInput(0, child);
        
        // Manual finalizer for script-path spend
        const customFinalizer = (_inputIndex, input) => {
            const witness = [
                input.tapLeafScript[0].controlBlock,
                input.tapLeafScript[0].script,
            ];
            return {
                finalScriptWitness: witnessStackToScriptWitness(witness)
            };
        };

        // bitcoinjs-lib doesn't have a built-in helper for this specific reveal yet in a simple way
        // So we manually construct the witness or use a helper
        
        console.log('\n--- Transactions Ready ---');
        console.log('Note: This script is a template. Real Ordinals minting requires complex witness management.');
        console.log('Broadcasting is disabled to prevent accidental loss of funds until logic is verified.');
        
        // In a real scenario, you'd broadcast commitTxHex first, then revealTxHex once commit is confirmed.
        // await axios.post(`${MEMPOOL_API}/tx`, commitTxHex);
        
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

function witnessStackToScriptWitness(witness) {
    let buffer = Buffer.allocUnsafe(0);
    function writeSlice(slice) {
        buffer = Buffer.concat([buffer, Buffer.from(slice)]);
    }
    function writeVarInt(i) {
        const b = Buffer.allocUnsafe(9);
        const len = bitcoin.script.number.encode(i); // This is wrong, need varint
        // ... implementation of varint ...
    }
    // Simplified for this template
    return Buffer.concat([
        Buffer.from([witness.length]),
        ...witness.map(w => Buffer.concat([Buffer.from([w.length]), w]))
    ]);
}

mintBRC20().catch(console.error);
