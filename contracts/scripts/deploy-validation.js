const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const ProvexValidation = await hre.ethers.getContractFactory("ProvexValidation");
  const validation = await ProvexValidation.deploy();
  await validation.waitForDeployment();

  const address = await validation.getAddress();
  console.log("\nProvexValidation deployed to:", address);
  console.log("Explorer: https://testnet.kitescan.ai/address/" + address);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
