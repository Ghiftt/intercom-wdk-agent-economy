// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ProvexValidation {

    enum ValidationStatus { Pending, Passed, Failed, ConsensusRequired }
    enum FaultType { None, AgentFault, ExternalFault, NetworkFault }

    struct ValidationResult {
        bytes32 taskId;
        address validator;
        uint8 dataAccuracy;
        uint8 transformationCorrectness;
        bool deliveryStatus;
        bool receiptIntegrity;
        FaultType faultType;
        bytes32 justificationHash;
        uint8 confidenceScore;
        ValidationStatus status;
        uint256 timestamp;
    }

    struct Layer0Check {
        bool hashValid;
        bool webhookSuccess;
        bool slamet;
        bool schemaCorrect;
        bool passed;
    }

    // Layer 3 consensus triggers
    uint8 public constant CONFIDENCE_THRESHOLD = 85;
    uint8 public constant SCORE_LOW = 65;
    uint8 public constant SCORE_HIGH = 79;
    uint256 public constant HIGH_VALUE_THRESHOLD = 0.1 ether;

    mapping(bytes32 => ValidationResult) public validations;
    mapping(bytes32 => Layer0Check) public layer0Results;
    mapping(bytes32 => bool) public consensusRequired;

    address public protocol;

    event Layer0Passed(bytes32 indexed taskId, uint256 timestamp);
    event Layer0Failed(bytes32 indexed taskId, string reason, FaultType faultType);
    event ValidationSubmitted(bytes32 indexed taskId, address validator, uint8 confidence);
    event ConsensusTriggered(bytes32 indexed taskId, string reason);
    event ValidationFinalized(bytes32 indexed taskId, ValidationStatus status);

    constructor() {
        protocol = msg.sender;
    }

    // Layer 0 — binary, brutal, no LLM
    function runLayer0(
        bytes32 taskId,
        bool hashValid,
        bool webhookSuccess,
        bool slaMet,
        bool schemaCorrect
    ) external returns (bool) {
        bool passed = hashValid && webhookSuccess && slaMet && schemaCorrect;

        layer0Results[taskId] = Layer0Check({
            hashValid: hashValid,
            webhookSuccess: webhookSuccess,
            slamet: slaMet,
            schemaCorrect: schemaCorrect,
            passed: passed
        });

        if (!passed) {
            FaultType fault = FaultType.AgentFault;
            if (!webhookSuccess) fault = FaultType.NetworkFault;
            if (!slaMet) fault = FaultType.AgentFault;

            string memory reason = !hashValid ? "Invalid hash chain" :
                                   !webhookSuccess ? "Webhook failed" :
                                   !slaMet ? "SLA missed" : "Schema invalid";

            emit Layer0Failed(taskId, reason, fault);
            return false;
        }

        emit Layer0Passed(taskId, block.timestamp);
        return true;
    }

    // Layer 1 + 2 — validator submits structured reasoning
    function submitValidation(
        bytes32 taskId,
        uint8 dataAccuracy,
        uint8 transformationCorrectness,
        bool deliveryStatus,
        bool receiptIntegrity,
        FaultType faultType,
        bytes32 justificationHash,
        uint256 taskPayment
    ) external {
        require(layer0Results[taskId].passed, "Layer 0 not passed");
        require(justificationHash != bytes32(0), "Reasoning required");
        require(validations[taskId].timestamp == 0, "Already validated");

        // Confidence score calculation
        uint8 confidence = (dataAccuracy + transformationCorrectness) / 2;
        if (deliveryStatus) confidence = (confidence * 110) / 100;
        if (confidence > 100) confidence = 100;

        ValidationStatus status = ValidationStatus.Passed;

        // Check Layer 3 triggers — locked thresholds
        bool needsConsensus = false;
        string memory consensusReason = "";

        if (confidence < CONFIDENCE_THRESHOLD) {
            needsConsensus = true;
            consensusReason = "Low confidence score";
        } else if (dataAccuracy >= SCORE_LOW && dataAccuracy <= SCORE_HIGH) {
            needsConsensus = true;
            consensusReason = "Borderline score";
        } else if (taskPayment >= HIGH_VALUE_THRESHOLD) {
            needsConsensus = true;
            consensusReason = "High value task";
        }

        if (needsConsensus) {
            status = ValidationStatus.ConsensusRequired;
            consensusRequired[taskId] = true;
            emit ConsensusTriggered(taskId, consensusReason);
        }

        validations[taskId] = ValidationResult({
            taskId: taskId,
            validator: msg.sender,
            dataAccuracy: dataAccuracy,
            transformationCorrectness: transformationCorrectness,
            deliveryStatus: deliveryStatus,
            receiptIntegrity: receiptIntegrity,
            faultType: faultType,
            justificationHash: justificationHash,
            confidenceScore: confidence,
            status: status,
            timestamp: block.timestamp
        });

        emit ValidationSubmitted(taskId, msg.sender, confidence);

        if (!needsConsensus) {
            emit ValidationFinalized(taskId, status);
        }
    }

    function getValidation(bytes32 taskId) external view returns (ValidationResult memory) {
        return validations[taskId];
    }

    function getLayer0(bytes32 taskId) external view returns (Layer0Check memory) {
        return layer0Results[taskId];
    }

    function needsConsensus(bytes32 taskId) external view returns (bool) {
        return consensusRequired[taskId];
    }
}
