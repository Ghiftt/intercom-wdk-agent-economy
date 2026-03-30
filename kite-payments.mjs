import { ethers } from 'ethers';

const KITE_RPC = process.env.KITE_RPC;
const GASLESS_URL = 'https://gasless.gokite.ai';
const KITE_TOKEN = process.env.KITE_TOKEN;
const CHAIN_ID = 2368;

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function nonces(address) view returns (uint256)",
  "function name() view returns (string)",
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external"
];

const provider = new ethers.JsonRpcProvider(KITE_RPC, {
  chainId: CHAIN_ID,
  name: 'kite-testnet'
});

// Get token balance for any address
export async function getTokenBalance(address) {
  const token = new ethers.Contract(KITE_TOKEN, ERC20_ABI, provider);
  const [balance, decimals, symbol] = await Promise.all([
    token.balanceOf(address),
    token.decimals(),
    token.symbol()
  ]);
  return {
    raw: balance,
    formatted: ethers.formatUnits(balance, decimals),
    symbol
  };
}

// Build EIP-3009 signed authorization for gasless transfer
export async function buildTransferAuthorization(privateKey, to, amountFormatted) {
  const wallet = new ethers.Wallet(privateKey, provider);
  const token = new ethers.Contract(KITE_TOKEN, ERC20_ABI, provider);

  const [decimals, tokenName, nonce] = await Promise.all([
    token.decimals(),
    token.name(),
    token.nonces(wallet.address)
  ]);

  const value = ethers.parseUnits(amountFormatted.toString(), decimals);
  const validAfter = 0;
  const validBefore = Math.floor(Date.now() / 1000) + 3600; // 1 hour
  const randomNonce = ethers.hexlify(ethers.randomBytes(32));

  // EIP-712 domain
  const domain = {
    name: tokenName,
    version: '1',
    chainId: CHAIN_ID,
    verifyingContract: KITE_TOKEN
  };

  // EIP-3009 TransferWithAuthorization type
  const types = {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' }
    ]
  };

  const message = {
    from: wallet.address,
    to,
    value,
    validAfter,
    validBefore,
    nonce: randomNonce
  };

  const signature = await wallet.signTypedData(domain, types, message);
  const { v, r, s } = ethers.Signature.from(signature);

  return { from: wallet.address, to, value, validAfter, validBefore, nonce: randomNonce, v, r, s };
}

// Submit gasless transfer to Kite relayer
export async function gaslessTransfer(privateKey, to, amountFormatted) {
  try {
    const auth = await buildTransferAuthorization(privateKey, to, amountFormatted);

    const response = await fetch(`${GASLESS_URL}/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: KITE_TOKEN,
        from: auth.from,
        to: auth.to,
        value: auth.value.toString(),
        validAfter: auth.validAfter,
        validBefore: auth.validBefore,
        nonce: auth.nonce,
        v: auth.v,
        r: auth.r,
        s: auth.s
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(`Gasless transfer failed: ${result.message || response.statusText}`);
    }

    console.log(`Gasless transfer sent: ${amountFormatted} tokens to ${to}`);
    console.log(`TX Hash: ${result.txHash}`);
    return result;

  } catch (err) {
    console.error('Gasless transfer error:', err.message);
    throw err;
  }
}

// Payment split — release task payment to all parties
export async function releaseTaskPayment(taskId, executorAddress, validatorAddress, amounts) {
  const results = [];

  console.log(`\nReleasing payment for task ${taskId}`);

  // Pay executor
  if (amounts.executor > 0) {
    const executorTx = await gaslessTransfer(
      process.env.SCOUT_PRIVATE_KEY,
      executorAddress,
      amounts.executor
    );
    results.push({ role: 'executor', ...executorTx });
  }

  // Pay primary validator
  if (amounts.validator > 0) {
    const validatorTx = await gaslessTransfer(
      process.env.SCOUT_PRIVATE_KEY,
      validatorAddress,
      amounts.validator
    );
    results.push({ role: 'validator', ...validatorTx });
  }

  console.log(`Payment released for task ${taskId}`);
  return results;
}

// Calculate payment splits
export function calculateSplits(totalAmount, hasConsensus = false) {
  if (hasConsensus) {
    return {
      executor: (totalAmount * 83) / 100,
      validationPool: (totalAmount * 12) / 100,
      protocol: (totalAmount * 5) / 100,
    };
  }
  return {
    executor: (totalAmount * 85) / 100,
    validator: (totalAmount * 8) / 100,
    protocol: (totalAmount * 5) / 100,
    staking: (totalAmount * 2) / 100,
  };
}
