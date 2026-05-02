const { ethers } = require('ethers');

const ADDRESS = '0x29eFB6A93c565EFFF225654C831Bb58BEB2BCbfD';

const NETWORKS = [
    { name: 'BSC', rpc: 'https://bsc-dataseed.binance.org/', chainId: 56 },
    { name: 'Polygon', rpc: 'https://polygon.llamarpc.com', chainId: 137 },
    { name: 'Base', rpc: 'https://mainnet.base.org', chainId: 8453 },
    { name: 'Arbitrum', rpc: 'https://arbitrum.drpc.org', chainId: 42161 },
    { name: 'Ethereum', rpc: 'https://eth.drpc.org', chainId: 1 }
];

const TOKENS = [
    { symbol: 'USDT', address: { 1: '0xdac17f958d2ee523a2206206994597c13d831ec7', 56: '0x55d398326f99059ff775485246999027b3197955', 137: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', 8453: '0xfde4C9625DF2a0D5a191853444322432ec5b607e', 42161: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9' } },
    { symbol: 'USDC', address: { 1: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 56: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', 137: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', 8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 42161: '0xff970a61a04b1ca14834a43f5de4533ebddb5ccd' } }
];

const MINIMAL_ERC20_ABI = [
    "function balanceLines(address owner) view returns (uint256)",
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)"
];

async function checkNetwork(network) {
    console.log(`\n--- Checking ${network.name} ---`);
    try {
        const provider = new ethers.JsonRpcProvider(network.rpc);
        const balance = await provider.getBalance(ADDRESS);
        console.log(`Native Balance: ${ethers.formatEther(balance)}`);

        for (const token of TOKENS) {
            const tokenAddr = token.address[network.chainId];
            if (tokenAddr) {
                try {
                    const contract = new ethers.Contract(tokenAddr, MINIMAL_ERC20_ABI, provider);
                    const tokenBalance = await contract.balanceOf(ADDRESS);
                    const decimals = await contract.decimals();
                    console.log(`${token.symbol}: ${ethers.formatUnits(tokenBalance, decimals)}`);
                } catch (e) {
                    // console.error(`Error checking ${token.symbol}: ${e.message}`);
                }
            }
        }
    } catch (err) {
        console.error(`Failed to check ${network.name}: ${err.message}`);
    }
}

async function main() {
    for (const network of NETWORKS) {
        await checkNetwork(network);
    }
}

main();
