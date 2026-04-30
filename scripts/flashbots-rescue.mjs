/**
 * ============================================================
 *  FLASHBOTS WALLET RESCUE SCRIPT
 * ============================================================
 *  This script bundles:
 *    TX 1: Send ETH from a CLEAN funder wallet → compromised wallet
 *    TX 2: Revoke all malicious token approvals from compromised wallet
 *
 *  Both TXs are submitted as a PRIVATE Flashbots bundle.
 *  They NEVER appear in the public mempool — the bot can't see them.
 *
 *  SETUP:
 *    1. npm install @flashbots/ethers-provider-bundle ethers dotenv
 *    2. Set FUNDER_PRIVATE_KEY in your .env (a CLEAN wallet with ETH)
 *    3. Set COMPROMISED_PRIVATE_KEY in your .env
 *    4. Run: node scripts/flashbots-rescue.mjs
 * ============================================================
 */

import { ethers } from "ethers";
import {
  FlashbotsBundleProvider,
} from "@flashbots/ethers-provider-bundle";
import * as dotenv from "dotenv";
dotenv.config();

// ============================================================
//  CONFIGURATION — Edit these values
// ============================================================

const COMPROMISED_ADDRESS = "0x29eFB6A93c565EFFF225654C831Bb58BEB2BCbfD";

// Token contracts that had malicious approvals granted
// (pulled from your transaction history)
const APPROVALS_TO_REVOKE = [
  {
    token: "0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0", // MATIC token
    name: "MATIC",
    spenders: [
      "0x4c9fad010d8be90aba505c85eacc483dff9b8fa9", // Hop Bridge (used legitimately, but revoke to be safe)
      "0x881d40237659c251811cec9c364ef91dc08d300c", // ParaSwap
      "0x11111112542d85b3ef69ae05771c2dccff4faa26", // 1inch
    ],
  },
  {
    token: "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
    name: "USDT",
    spenders: [
      "0xdef1c0ded9bec7f1a1670819833240f027b25eff", // 0x Exchange Proxy
    ],
  },
  {
    token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
    name: "USDC",
    spenders: [
      "0xe66b31678d6c16e9ebf358268a790b763c133750", // KyberSwap
      "0x881d40237659c251811cec9c364ef91dc08d300c", // ParaSwap
      "0x11111112542d85b3ef69ae05771c2dccff4faa26", // 1inch
    ],
  },
  {
    0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0
    token: "0x0c10bf8fcb7bf5412187a595ab97a3609160b5c6", // USDD
    name: "USDD",
    spenders: [
      "0x9277a463a508f45115fdeaf22ffeda1b16352433", // Uniswap Router
      "0x1111111254eeb25477b68fb85ed929f73a960582", // 1inch v5
    ],
  },
  {
    token: "0x4fabb145d64652a948d72533023f6e7a623c7c53", // BUSD
    name: "BUSD",
    spenders: [
      "0x11111112542d85b3ef69ae05771c2dccff4faa26", // 1inch
      "0x881d40237659c251811cec9c364ef91dc08d300c", // ParaSwap
    ],
  },
  {
    token: "0x6b175474e89094c44da98b954eedeac495271d0f", // DAI
    name: "DAI",
    spenders: [
      "0x40ec5b33f54e0e8a33a975908c5ba1c14e5bbbdf", // Polygon Bridge
    ],
  },
  {
    token: "0x5d0fa08aeb173ade44b0cf7f31d506d8e04f0ac8", // 360APP/DAPP
    name: "DAPP",
    spenders: [
      "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45", // Uniswap Universal Router
      "0x881d40237659c251811cec9c364ef91dc08d300c", // ParaSwap
      "0x40ec5b33f54e0e8a33a975908c5ba1c14e5bbbdf", // Polygon Bridge
    ],
  },
  {
    token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
    name: "WETH",
    spenders: [
      "0x40ec5b33f54e0e8a33a975908c5ba1c14e5bbbdf", // Polygon Bridge
    ],
  },
];

// ERC-20 approve ABI (setting allowance to 0 = revoke)
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
];

// ============================================================
//  MAIN RESCUE FUNCTION
// ============================================================
async function main() {
  console.log("\n🚨 FLASHBOTS WALLET RESCUE SCRIPT");
  console.log("=====================================\n");

  // Validate env vars
  if (!process.env.PRIVATE_KEY) {
    throw new Error(
      "FUNDER_PRIVATE_KEY not set in .env — add a CLEAN wallet private key"
    );
  }
  if (!process.env.COMPROMISED_PRIVATE_KEY) {
    throw new Error(
      "COMPROMISED_PRIVATE_KEY not set in .env"
    );
  }

  // Setup providers
  const provider = new ethers.JsonRpcProvider(
    process.env.MAINNET_URL || "https://ethereum-rpc.publicnode.com"
  );

  // Funder wallet (CLEAN — sends the ETH for gas)
  const funderWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  // Compromised wallet (signs the revoke txs)
  const compromisedWallet = new ethers.Wallet(
    process.env.COMPROMISED_PRIVATE_KEY,
    provider
  );

  console.log(`🔑 Funder wallet:      ${funderWallet.address}`);
  console.log(`⚠️  Compromised wallet: ${compromisedWallet.address}`);

  // Check funder balance
  const funderBalance = await provider.getBalance(funderWallet.address);
  console.log(`\n💰 Funder ETH balance: ${ethers.formatEther(funderBalance)} ETH`);

  if (funderBalance < ethers.parseEther("0.005")) {
    throw new Error(
      "Funder wallet has less than 0.005 ETH. Please fund it first."
    );
  }

  // Get current gas data
  const feeData = await provider.getFeeData();
  const maxFeePerGas = feeData.maxFeePerGas * 3n; // 3x to ensure inclusion
  const maxPriorityFeePerGas = ethers.parseUnits("3", "gwei");

  console.log(
    `⛽ Max fee per gas: ${ethers.formatUnits(maxFeePerGas, "gwei")} gwei`
  );

  // Calculate total gas needed for all revoke txs
  const GAS_PER_REVOKE = 50000n; // ~50k gas per approve tx
  let totalRevokeTxs = 0;
  for (const token of APPROVALS_TO_REVOKE) {
    totalRevokeTxs += token.spenders.length;
  }
  const totalGasNeeded = GAS_PER_REVOKE * BigInt(totalRevokeTxs);
  const ethNeeded = totalGasNeeded * maxFeePerGas;
  const ethToSend = ethNeeded + ethers.parseEther("0.002"); // small buffer

  console.log(`\n📋 Revoke transactions to build: ${totalRevokeTxs}`);
  console.log(`💸 ETH to send to compromised wallet: ${ethers.formatEther(ethToSend)} ETH\n`);

  // Setup Flashbots provider
  console.log("🔌 Connecting to Flashbots...");
  const flashbotsProvider = await FlashbotsBundleProvider.create(
    provider,
    funderWallet, // Used as the Flashbots auth signer
    "https://relay.flashbots.net",
    "mainnet"
  );
  console.log("✅ Connected to Flashbots relay\n");

  // Get current nonce for both wallets
  const funderNonce = await provider.getTransactionCount(funderWallet.address);
  const compromisedNonce = await provider.getTransactionCount(
    compromisedWallet.address
  );

  // Build the bundle of transactions
  const bundleTransactions = [];

  // --- TX 1: Fund the compromised wallet with ETH for gas ---
  console.log("📦 Building TX 1: Fund compromised wallet...");
  bundleTransactions.push({
    signer: funderWallet,
    transaction: {
      chainId: 1,
      type: 2,
      to: COMPROMISED_ADDRESS,
      value: ethToSend,
      gasLimit: 21000,
      maxFeePerGas,
      maxPriorityFeePerGas,
      nonce: funderNonce,
    },
  });

  // --- TXs 2+: Revoke all approvals from the compromised wallet ---
  let nonceOffset = 0;
  for (const tokenInfo of APPROVALS_TO_REVOKE) {
    const tokenContract = new ethers.Contract(
      tokenInfo.token,
      ERC20_ABI,
      compromisedWallet
    );

    for (const spender of tokenInfo.spenders) {
      console.log(
        `📦 Building revoke TX: ${tokenInfo.name} → ${spender.slice(0, 10)}...`
      );

      const revokeData = tokenContract.interface.encodeFunctionData("approve", [
        spender,
        0n, // Set allowance to 0 = revoke
      ]);

      bundleTransactions.push({
        signer: compromisedWallet,
        transaction: {
          chainId: 1,
          type: 2,
          to: tokenInfo.token,
          data: revokeData,
          gasLimit: GAS_PER_REVOKE,
          maxFeePerGas,
          maxPriorityFeePerGas,
          nonce: compromisedNonce + nonceOffset,
        },
      });
      nonceOffset++;
    }
  }

  console.log(`\n✅ Bundle built with ${bundleTransactions.length} transactions`);

  // Simulate the bundle first
  console.log("\n🔍 Simulating bundle...");
  const blockNumber = await provider.getBlockNumber();
  const simulation = await flashbotsProvider.simulate(
    bundleTransactions,
    blockNumber + 1
  );

  if ("error" in simulation) {
    console.error("❌ Simulation failed:", simulation.error);
    throw new Error(`Simulation failed: ${JSON.stringify(simulation.error)}`);
  }

  console.log("✅ Simulation passed!");
  console.log(
    `   Total gas used: ${simulation.totalGasUsed.toLocaleString()}`
  );
  console.log(
    `   Coinbase diff:  ${ethers.formatEther(simulation.coinbaseDiff)} ETH`
  );

  // Submit for 5 consecutive blocks (increases chance of inclusion)
  console.log("\n🚀 Submitting bundle to Flashbots for 5 blocks...\n");
  let included = false;

  for (let i = 1; i <= 5; i++) {
    const targetBlock = blockNumber + i;
    const bundleResponse = await flashbotsProvider.sendBundle(
      bundleTransactions,
      targetBlock
    );

    if ("error" in bundleResponse) {
      console.error(`   Block ${targetBlock}: ❌ ${bundleResponse.error.message}`);
      continue;
    }

    console.log(`   Block ${targetBlock}: Submitted ✓`);

    // Wait for result
    const waitResponse = await bundleResponse.wait();
    if (waitResponse === 0) {
      console.log(`\n🎉 SUCCESS! Bundle included in block ${targetBlock}!`);
      console.log(
        "   All malicious token approvals have been revoked atomically."
      );
      included = true;
      break;
    } else if (waitResponse === 1) {
      console.log(`   Block ${targetBlock}: Not included (bundle replaced by higher bid)`);
    }
  }

  if (!included) {
    console.log(
      "\n⚠️  Bundle not included in 5 blocks. Try running again — gas may need to be higher."
    );
    console.log("   Tip: Increase the gas multiplier (line ~72) from 3n to 5n");
  }
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err.message);
  process.exit(1);
});
