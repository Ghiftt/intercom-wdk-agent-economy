const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const ProvexAttestation = await hre.ethers.getContractFactory("ProvexAttestation");
  const attestation = await ProvexAttestation.deploy();
  await attestation.waitForDeployment();

  const address = await attestation.getAddress();
  console.log("\nProvexAttestation deployed to:", address);
  console.log("Explorer: https://testnet.kitescan.ai/address/" + address);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
