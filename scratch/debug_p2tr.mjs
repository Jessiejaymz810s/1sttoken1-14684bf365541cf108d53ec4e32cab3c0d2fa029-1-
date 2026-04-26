import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
bitcoin.initEccLib(ecc);

const internalPubkey = Buffer.alloc(32, 1);
const inscriptionScript = bitcoin.script.compile([
    internalPubkey,
    bitcoin.opcodes.OP_CHECKSIG,
    bitcoin.opcodes.OP_0,
    bitcoin.opcodes.OP_IF,
    Buffer.from('ord'),
    bitcoin.opcodes.OP_1,
    Buffer.from('text/plain;charset=utf-8'),
    bitcoin.opcodes.OP_0,
    Buffer.from('test'),
    bitcoin.opcodes.OP_ENDIF
]);

const scriptTaproot = bitcoin.payments.p2tr({
    internalPubkey,
    scriptTree: { output: inscriptionScript },
    network: bitcoin.networks.testnet
});

console.log('Keys:', Object.keys(scriptTaproot));
if (scriptTaproot.redeem) {
    console.log('Redeem Keys:', Object.keys(scriptTaproot.redeem));
} else {
    console.log('Redeem is undefined');
}
