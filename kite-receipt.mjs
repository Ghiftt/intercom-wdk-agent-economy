import { ethers } from 'ethers';
import { createHash } from 'crypto';

// Receipt schema version — lock this, never change mid-hackathon
const SCHEMA_VERSION = '1.0';

// Build a normalized reasoning object for justificationHash
export function buildReasoning(scores) {
  // Field order is fixed — same order always = deterministic hash
  return {
    schema_version: SCHEMA_VERSION,
    data_accuracy: scores.dataAccuracy,
    transformation_correctness: scores.transformationCorrectness,
    delivery_status: scores.deliveryStatus ? 'pass' : 'fail',
    receipt_integrity: scores.receiptIntegrity ? 'pass' : 'fail',
    fault_type: scores.faultType,
    scoring_version: '1.0'
  };
}

// Hash a normalized reasoning object
export function hashReasoning(reasoningObject) {
  const normalized = JSON.stringify(reasoningObject);
  return '0x' + createHash('sha256').update(normalized).digest('hex');
}

// Build execution receipt — signed log of everything agent did
export function buildReceipt(taskId, agentAddress, steps) {
  const receipt = {
    schema_version: SCHEMA_VERSION,
    task_id: taskId,
    agent_address: agentAddress,
    timestamp: Date.now(),
    steps: steps.map((step, index) => ({
      index,
      action: step.action,
      input_hash: hashData(step.input),
      output_hash: hashData(step.output),
      timestamp: step.timestamp || Date.now(),
      success: step.success
    }))
  };

  // Hash chain — each step includes hash of previous step
  for (let i = 1; i < receipt.steps.length; i++) {
    receipt.steps[i].prev_hash = hashData(receipt.steps[i - 1]);
  }

  receipt.receipt_hash = hashData(receipt);
  return receipt;
}

// Validate receipt integrity — check hash chain is unbroken
export function validateReceiptIntegrity(receipt) {
  for (let i = 1; i < receipt.steps.length; i++) {
    const expectedPrevHash = hashData(receipt.steps[i - 1]);
    if (receipt.steps[i].prev_hash !== expectedPrevHash) {
      return false;
    }
  }
  return true;
}

// Hash any data deterministically
export function hashData(data) {
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  return '0x' + createHash('sha256').update(str).digest('hex');
}

// Convert hash to bytes32 for Solidity
export function toBytes32(hash) {
  return ethers.zeroPadValue(hash, 32);
}

// Build SLA hash — agent commits to this on task acceptance
export function buildSLAHash(taskId, agentAddress, deadline, outputSchema, minQuality) {
  const sla = {
    task_id: taskId,
    agent_address: agentAddress,
    deadline,
    output_schema: outputSchema,
    min_quality_threshold: minQuality,
    committed_at: Date.now()
  };
  return hashData(sla);
}
