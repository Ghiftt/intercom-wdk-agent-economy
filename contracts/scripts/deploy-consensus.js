const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const ProvexConsensus = await hre.ethers.getContractFactory("ProvexConsensus");
  const consensus = await ProvexConsensus.deploy();
  await consensus.waitForDeployment();

  const address = await consensus.getAddress();
  console.log("\nProvexConsensus deployed to:", address);
  console.log("Explorer: https://testnet.kitescan.ai/address/" + address);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
