import { ethers } from 'ethers';

const KITE_RPC = process.env.KITE_RPC;
const CHAIN_ID = 2368;

// Contract addresses
const ADDRESSES = {
  registry:    process.env.PROVEX_REGISTRY,
  escrow:      process.env.PROVEX_ESCROW,
  validation:  process.env.PROVEX_VALIDATION,
  consensus:   process.env.PROVEX_CONSENSUS,
  attestation: process.env.PROVEX_ATTESTATION,
};

// ABIs — only what we need
const ABIS = {
  registry: [
    "function register(string memory name, string[] memory capabilities) external payable",
    "function getAgent(address) external view returns (tuple(address agentAddress, string name, string[] capabilities, uint256 stake, uint256 registeredAt, uint256 reputationScore, uint8 status))",
    "function updateReputation(address, uint256) external",
    "function banAgent(address) external",
    "function getTotalAgents() external view returns (uint256)",
    "event AgentRegistered(address indexed agentAddress, string name, uint256 timestamp)"
  ],
  escrow: [
    "function postTask(uint256 deadline, uint8 tier) external payable returns (bytes32)",
    "function acceptTask(bytes32 taskId, bytes32 slaHash) external",
    "function submitReceipt(bytes32 taskId, bytes32 receiptHash) external",
    "function releasePayment(bytes32 taskId) external",
    "function refundPayment(bytes32 taskId) external",
    "function getTask(bytes32 taskId) external view returns (tuple(address poster, address executor, uint256 payment, uint256 validationFee, uint256 deadline, uint8 status, uint8 tier, bytes32 slaHash, bytes32 receiptHash, uint256 createdAt))",
    "event TaskPosted(bytes32 indexed taskId, address poster, uint256 payment, uint8 tier)",
    "event PaymentReleased(bytes32 indexed taskId, address executor, uint256 amount)"
  ],
  validation: [
    "function runLayer0(bytes32 taskId, bool hashValid, bool webhookSuccess, bool slaMet, bool schemaCorrect) external returns (bool)",
    "function submitValidation(bytes32 taskId, uint8 dataAccuracy, uint8 transformationCorrectness, bool deliveryStatus, bool receiptIntegrity, uint8 faultType, bytes32 justificationHash, uint256 taskPayment) external",
    "function getValidation(bytes32 taskId) external view returns (tuple(bytes32 taskId, address validator, uint8 dataAccuracy, uint8 transformationCorrectness, bool deliveryStatus, bool receiptIntegrity, uint8 faultType, bytes32 justificationHash, uint8 confidenceScore, uint8 status, uint256 timestamp))",
    "function getLayer0(bytes32 taskId) external view returns (tuple(bool hashValid, bool webhookSuccess, bool slamet, bool schemaCorrect, bool passed))",
    "function needsConsensus(bytes32 taskId) external view returns (bool)",
    "event Layer0Passed(bytes32 indexed taskId, uint256 timestamp)",
    "event Layer0Failed(bytes32 indexed taskId, string reason, uint8 faultType)",
    "event ConsensusTriggered(bytes32 indexed taskId, string reason)"
  ],
  consensus: [
    "function stakeAsValidator() external payable",
    "function startConsensus(bytes32 taskId, address[3] memory selectedValidators) external",
    "function submitVote(bytes32 taskId, uint8 score, bytes32 justificationHash) external",
    "function getFinalScore(bytes32 taskId) external view returns (uint8)",
    "function getVoteCount(bytes32 taskId) external view returns (uint8)",
    "function getValidatorStake(address) external view returns (uint256)",
    "event ConsensusResolved(bytes32 indexed taskId, uint8 finalScore, uint8 status)"
  ],
  attestation: [
    "function writeAttestation(bytes32 taskId, address executor, address primaryValidator, uint8 finalScore, uint8 faultType, bool paymentReleased, bool agentSlashed, bytes32 fullReasoningHash) external",
    "function getAttestation(bytes32 taskId) external view returns (tuple(bytes32 taskId, address executor, address primaryValidator, uint8 finalScore, uint8 faultType, bool paymentReleased, bool agentSlashed, bool agentBanned, bytes32 fullReasoningHash, uint256 timestamp))",
    "function getAgentReputation(address) external view returns (uint256)",
    "function getAgentHistory(address) external view returns (bytes32[])",
    "function isAgentBanned(address) external view returns (bool)",
    "event AttestationWritten(bytes32 indexed taskId, address indexed executor, uint8 finalScore, bool paymentReleased)"
  ]
};

// Provider — shared, read only
const provider = new ethers.JsonRpcProvider(KITE_RPC, {
  chainId: CHAIN_ID,
  name: 'kite-testnet'
});

// Get read-only contract instance
function getContract(name) {
  return new ethers.Contract(ADDRESSES[name], ABIS[name], provider);
}

// Get write contract instance with signer
function getSignedContract(name, privateKey) {
  const wallet = new ethers.Wallet(privateKey, provider);
  return new ethers.Contract(ADDRESSES[name], ABIS[name], wallet);
}

// Retry wrapper for on-chain writes
async function withRetry(fn, retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`Chain write failed, retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// Registry operations
export const registry = {
  getAgent: (address) => getContract('registry').getAgent(address),
  getTotalAgents: () => getContract('registry').getTotalAgents(),
  register: (privateKey, name, capabilities) =>
    withRetry(() =>
      getSignedContract('registry', privateKey).register(name, capabilities, {
        value: ethers.parseEther('0.01')
      })
    ),
  updateReputation: (privateKey, agentAddress, score) =>
    withRetry(() =>
      getSignedContract('registry', privateKey).updateReputation(agentAddress, score)
    ),
  banAgent: (privateKey, agentAddress) =>
    withRetry(() =>
      getSignedContract('registry', privateKey).banAgent(agentAddress)
    ),
};

// Escrow operations
export const escrow = {
  postTask: (privateKey, deadlineSeconds, tier, paymentEth) =>
    withRetry(() =>
      getSignedContract('escrow', privateKey).postTask(deadlineSeconds, tier, {
        value: ethers.parseEther(paymentEth.toString())
      })
    ),
  acceptTask: (privateKey, taskId, slaHash) =>
    withRetry(() =>
      getSignedContract('escrow', privateKey).acceptTask(taskId, slaHash)
    ),
  submitReceipt: (privateKey, taskId, receiptHash) =>
    withRetry(() =>
      getSignedContract('escrow', privateKey).submitReceipt(taskId, receiptHash)
    ),
  releasePayment: (privateKey, taskId) =>
    withRetry(() =>
      getSignedContract('escrow', privateKey).releasePayment(taskId)
    ),
  refundPayment: (privateKey, taskId) =>
    withRetry(() =>
      getSignedContract('escrow', privateKey).refundPayment(taskId)
    ),
  getTask: (taskId) => getContract('escrow').getTask(taskId),
};

// Validation operations
export const validation = {
  runLayer0: (privateKey, taskId, hashValid, webhookSuccess, slaMet, schemaCorrect) =>
    withRetry(() =>
      getSignedContract('validation', privateKey).runLayer0(
        taskId, hashValid, webhookSuccess, slaMet, schemaCorrect
      )
    ),
  submitValidation: (privateKey, taskId, scores, taskPayment) =>
    withRetry(() =>
      getSignedContract('validation', privateKey).submitValidation(
        taskId,
        scores.dataAccuracy,
        scores.transformationCorrectness,
        scores.deliveryStatus,
        scores.receiptIntegrity,
        scores.faultType,
        scores.justificationHash,
        ethers.parseEther(taskPayment.toString())
      )
    ),
  getValidation: (taskId) => getContract('validation').getValidation(taskId),
  getLayer0: (taskId) => getContract('validation').getLayer0(taskId),
  needsConsensus: (taskId) => getContract('validation').needsConsensus(taskId),
};

// Consensus operations
export const consensus = {
  stake: (privateKey, amountEth) =>
    withRetry(() =>
      getSignedContract('consensus', privateKey).stakeAsValidator({
        value: ethers.parseEther(amountEth.toString())
      })
    ),
  startConsensus: (privateKey, taskId, validators) =>
    withRetry(() =>
      getSignedContract('consensus', privateKey).startConsensus(taskId, validators)
    ),
  submitVote: (privateKey, taskId, score, justificationHash) =>
    withRetry(() =>
      getSignedContract('consensus', privateKey).submitVote(taskId, score, justificationHash)
    ),
  getFinalScore: (taskId) => getContract('consensus').getFinalScore(taskId),
  getVoteCount: (taskId) => getContract('consensus').getVoteCount(taskId),
  getValidatorStake: (address) => getContract('consensus').getValidatorStake(address),
};

// Attestation operations
export const attestation = {
  write: (privateKey, taskId, executor, primaryValidator, finalScore, faultType, paymentReleased, agentSlashed, reasoningHash) =>
    withRetry(() =>
      getSignedContract('attestation', privateKey).writeAttestation(
        taskId, executor, primaryValidator, finalScore,
        faultType, paymentReleased, agentSlashed, reasoningHash
      )
    ),
  get: (taskId) => getContract('attestation').getAttestation(taskId),
  getReputation: (address) => getContract('attestation').getAgentReputation(address),
  getHistory: (address) => getContract('attestation').getAgentHistory(address),
  isBanned: (address) => getContract('attestation').isAgentBanned(address),
};

export { provider, ethers };
