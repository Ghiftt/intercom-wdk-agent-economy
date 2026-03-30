const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const ProvexEscrow = await hre.ethers.getContractFactory("ProvexEscrow");
  const escrow = await ProvexEscrow.deploy();
  await escrow.waitForDeployment();

  const address = await escrow.getAddress();
  console.log("\nProvexEscrow deployed to:", address);
  console.log("Explorer: https://testnet.kitescan.ai/address/" + address);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
