const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "ETH");

  const ProvexRegistry = await hre.ethers.getContractFactory("ProvexRegistry");
  const registry = await ProvexRegistry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("\nProvexRegistry deployed to:", address);
  console.log("View on explorer: https://testnet.kitescan.ai/address/" + address);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
