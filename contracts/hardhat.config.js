require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: "../.env" });

module.exports = {
  solidity: "0.8.24",
  networks: {
    kite_testnet: {
      url: process.env.KITE_RPC,
      chainId: 2368,
      accounts: [process.env.SCOUT_PRIVATE_KEY],
    },
  },
};
