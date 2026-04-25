const hre = require("hardhat");

async function main() {
  const address = "0x7fE8341919f3f17Bf431Eea40c9569d9721c55bf";
  // We can't easily get the creation tx hash from just the address without an indexer,
  // but we can estimate it again more carefully or use a known average.
  
  const QuazrToken = await hre.ethers.getContractFactory("QuazrToken");
  const deployTx = await QuazrToken.getDeployTransaction(1000000);
  const gasEstimate = await hre.ethers.provider.estimateGas(deployTx);
  
  console.log(`Estimated gas for deployment: ${gasEstimate.toString()}`);
}

main().catch(console.error);
