const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  const feeData = await hre.ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice;
  const gasUsed = 1194792n; // Estimated from previous run
  const estCost = gasUsed * gasPrice;

  console.log(`Network: ${hre.network.name}`);
  console.log(`Wallet: ${deployer.address}`);
  console.log(`Balance: ${hre.ethers.formatEther(balance)} POL/MATIC`);
  console.log(`Gas Price: ${hre.ethers.formatUnits(gasPrice, 'gwei')} Gwei`);
  console.log(`Est. Deployment Cost: ${hre.ethers.formatEther(estCost)} POL/MATIC`);
  
  if (balance >= estCost) {
    console.log("✅ Sufficient balance for deployment.");
  } else {
    console.log("❌ Insufficient balance for deployment.");
  }
}

main().catch(console.error);
