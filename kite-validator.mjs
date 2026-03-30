import { ethers } from 'ethers';
import { validation, attestation, escrow } from './kite-contracts.mjs';
import { buildReasoning, hashReasoning, hashData, toBytes32, validateReceiptIntegrity } from './kite-receipt.mjs';
import { calculateSplits, gaslessTransfer } from './kite-payments.mjs';

const VALIDATOR_KEY = process.env.VALIDATOR_PRIVATE_KEY;
const SCOUT_KEY = process.env.SCOUT_PRIVATE_KEY;
const VALIDATOR_ADDRESS = '0xB49c26DaCFA3a244b401A2BB360530a97D9e3527';

// Layer 0 — binary, brutal, no LLM
async function runLayer0(taskId, receipt, webhookStatus, deadline) {
  console.log('\nLayer 0 — Auto validation...');

  const hashValid = validateReceiptIntegrity(receipt);
  const webhookSuccess = webhookStatus === 200;
  const slaMet = Date.now() < deadline;
  const schemaCorrect = !!(
    receipt.steps &&
    receipt.steps.length >= 4 &&
    receipt.receipt_hash
  );

  console.log(`  Hash chain valid   : ${hashValid}`);
  console.log(`  Webhook success    : ${webhookSuccess}`);
  console.log(`  SLA met            : ${slaMet}`);
  console.log(`  Schema correct     : ${schemaCorrect}`);

  const passed = hashValid && webhookSuccess && slaMet && schemaCorrect;

  // Write to chain async — don't block
  validation.runLayer0(
    VALIDATOR_KEY,
    taskId,
    hashValid,
    webhookSuccess,
    slaMet,
    schemaCorrect
  ).then(tx => {
    console.log(`  Layer 0 on-chain: ${tx.hash}`);
  }).catch(err => {
    console.warn(`  Layer 0 chain write failed (non-blocking): ${err.message}`);
  });

  if (!passed) {
    const reason = !hashValid ? 'Invalid hash chain' :
                   !webhookSuccess ? 'Webhook failed' :
                   !slaMet ? 'SLA missed' : 'Schema invalid';
    return { passed: false, reason };
  }

  return { passed: true };
}

// Layer 1 — confidence scoring
function runLayer1(pipelineResult) {
  console.log('\nLayer 1 — Confidence scoring...');

  const { payload, receipt } = pipelineResult;
  const signal = payload?.signal;

  // Data accuracy — check price data is realistic
  const btcPrice = payload?.price_data?.BTC?.price;
  const ethPrice = payload?.price_data?.ETH?.price;
  const pricesRealistic = btcPrice > 1000 && btcPrice < 1000000 &&
                          ethPrice > 10 && ethPrice < 100000;

  // Transformation correctness — signal has all required fields
  const signalComplete = !!(
    signal?.signal &&
    signal?.confidence >= 0 &&
    signal?.confidence <= 1 &&
    signal?.reasoning &&
    signal?.risk_level
  );

  // Cross-source check — polymarket data present (bonus)
  const hasPolymarket = !!payload?.polymarket_data;

  // Score calculation
  let dataAccuracy = pricesRealistic ? 95 : 40;
  let transformationCorrectness = signalComplete ? 90 : 30;
  if (hasPolymarket) {
    dataAccuracy = Math.min(dataAccuracy + 5, 100);
    transformationCorrectness = Math.min(transformationCorrectness + 5, 100);
  }

  const confidence = Math.round((dataAccuracy + transformationCorrectness) / 2);

  console.log(`  Data accuracy           : ${dataAccuracy}`);
  console.log(`  Transformation correct  : ${transformationCorrectness}`);
  console.log(`  Has Polymarket data     : ${hasPolymarket}`);
  console.log(`  Confidence score        : ${confidence}`);

  // Layer 3 triggers — locked thresholds
  const needsConsensus =
    confidence < 85 ||
    (dataAccuracy >= 65 && dataAccuracy <= 79) ||
    false; // high value check happens in validator

  return {
    dataAccuracy,
    transformationCorrectness,
    confidence,
    needsConsensus,
    deliveryStatus: true,
    receiptIntegrity: true
  };
}

// Layer 2 — single validator scoring + structured reasoning
async function runLayer2(taskId, scores, taskPayment) {
  console.log('\nLayer 2 — Validator scoring...');

  const reasoning = buildReasoning({
    dataAccuracy: scores.dataAccuracy,
    transformationCorrectness: scores.transformationCorrectness,
    deliveryStatus: scores.deliveryStatus,
    receiptIntegrity: scores.receiptIntegrity,
    faultType: 0 // None
  });

  const justificationHash = hashReasoning(reasoning);
  const justificationBytes32 = toBytes32(justificationHash);

  console.log(`  Final score        : ${scores.confidence}`);
  console.log(`  Justification hash : ${justificationHash}`);
  console.log(`  Needs consensus    : ${scores.needsConsensus}`);

  // Write validation to chain async
  validation.submitValidation(
    VALIDATOR_KEY,
    taskId,
    scores,
    taskPayment
  ).then(tx => {
    console.log(`  Layer 2 on-chain: ${tx.hash}`);
  }).catch(err => {
    console.warn(`  Layer 2 chain write failed (non-blocking): ${err.message}`);
  });

  return {
    finalScore: scores.confidence,
    justificationHash,
    justificationBytes32,
    needsConsensus: scores.needsConsensus,
    reasoning
  };
}

// Write final attestation
async function writeAttestation(taskId, executorAddress, finalScore, faultType, paymentReleased, agentSlashed, reasoningHash) {
  console.log('\nWriting attestation to Kite chain...');

  attestation.write(
    VALIDATOR_KEY,
    taskId,
    executorAddress,
    VALIDATOR_ADDRESS,
    finalScore,
    faultType,
    paymentReleased,
    agentSlashed,
    toBytes32(reasoningHash)
  ).then(tx => {
    console.log(`  Attestation on-chain: ${tx.hash}`);
    console.log(`  Explorer: https://testnet.kitescan.ai/tx/${tx.hash}`);
  }).catch(err => {
    console.warn(`  Attestation chain write failed (non-blocking): ${err.message}`);
  });
}

// x402 decision — HTTP 200 or 402
function x402Decision(finalScore, layer0Passed) {
  if (!layer0Passed) return { status: 402, reason: 'Layer 0 failed' };
  if (finalScore >= 80) return { status: 200, reason: 'Validation passed' };
  if (finalScore >= 65) return { status: 402, reason: 'Score below threshold' };
  return { status: 402, reason: 'Validation failed' };
}

// Main validator — runs all layers
export async function validateTask(taskId, pipelineResult, executorAddress, taskPayment, deadline) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Validating task: ${taskId}`);
  console.log(`${'='.repeat(50)}`);

  // Layer 0
  const layer0 = await runLayer0(
    taskId,
    pipelineResult.receipt,
    pipelineResult.webhookStatus,
    deadline
  );

  if (!layer0.passed) {
    console.log(`\n❌ Layer 0 FAILED: ${layer0.reason}`);
    await writeAttestation(taskId, executorAddress, 0, 1, false, true, hashData(layer0.reason));
    return { status: 402, reason: layer0.reason, finalScore: 0 };
  }

  console.log('✅ Layer 0 PASSED');

  // Layer 1
  const scores = runLayer1(pipelineResult);

  // Layer 2
  const validationResult = await runLayer2(taskId, scores, taskPayment);

  // x402 decision
  const decision = x402Decision(validationResult.finalScore, true);

  const paymentReleased = decision.status === 200;

  // Write attestation
  await writeAttestation(
    taskId,
    executorAddress,
    validationResult.finalScore,
    0, // no fault
    paymentReleased,
    false,
    validationResult.justificationHash
  );

  if (paymentReleased) {
    console.log(`\n✅ x402: HTTP 200 — Payment approved`);
    console.log(`   Final score: ${validationResult.finalScore}`);
  } else {
    console.log(`\n❌ x402: HTTP 402 — Payment blocked`);
    console.log(`   Reason: ${decision.reason}`);
    console.log(`   Final score: ${validationResult.finalScore}`);
  }

  return {
    ...decision,
    finalScore: validationResult.finalScore,
    needsConsensus: validationResult.needsConsensus,
    justificationHash: validationResult.justificationHash
  };
}
