// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ProvexAttestation {

    enum FaultType { None, AgentFault, ExternalFault, NetworkFault }

    struct Attestation {
        bytes32 taskId;
        address executor;
        address primaryValidator;
        uint8 finalScore;
        FaultType faultType;
        bool paymentReleased;
        bool agentSlashed;
        bool agentBanned;
        bytes32 fullReasoningHash;
        uint256 timestamp;
    }

    mapping(bytes32 => Attestation) public attestations;
    mapping(address => bytes32[]) public agentHistory;
    mapping(address => uint256) public agentReputation;
    mapping(address => bool) public bannedAgents;

    uint256 public constant INITIAL_REPUTATION = 100;
    uint256 public constant BAN_THRESHOLD = 3;
    mapping(address => uint256) public failureCount;

    address public protocol;

    event AttestationWritten(
        bytes32 indexed taskId,
        address indexed executor,
        uint8 finalScore,
        bool paymentReleased
    );
    event ReputationUpdated(address indexed agent, uint256 oldScore, uint256 newScore);
    event AgentSlashed(address indexed agent, uint256 amount, FaultType faultType);
    event AgentBanned(address indexed agent, uint256 failureCount);

    constructor() {
        protocol = msg.sender;
    }

    function writeAttestation(
        bytes32 taskId,
        address executor,
        address primaryValidator,
        uint8 finalScore,
        FaultType faultType,
        bool paymentReleased,
        bool agentSlashed,
        bytes32 fullReasoningHash
    ) external {
        require(msg.sender == protocol, "Only protocol");
        require(attestations[taskId].timestamp == 0, "Already attested");

        // Initialize reputation if first task
        if (agentReputation[executor] == 0) {
            agentReputation[executor] = INITIAL_REPUTATION;
        }

        uint256 oldReputation = agentReputation[executor];
        bool agentBanned = false;

        // Update reputation based on score
        if (faultType == FaultType.AgentFault) {
            failureCount[executor]++;

            // Reputation penalty scales with score
            uint256 penalty = finalScore < 50 ? 15 : finalScore < 65 ? 10 : 5;
            if (agentReputation[executor] > penalty) {
                agentReputation[executor] -= penalty;
            } else {
                agentReputation[executor] = 0;
            }

            // Ban check
            if (failureCount[executor] >= BAN_THRESHOLD) {
                bannedAgents[executor] = true;
                agentBanned = true;
                emit AgentBanned(executor, failureCount[executor]);
            }

            if (agentSlashed) {
                emit AgentSlashed(executor, 0, faultType);
            }
        } else if (paymentReleased) {
            // Reputation boost on success
            uint256 boost = finalScore >= 90 ? 5 : finalScore >= 80 ? 3 : 1;
            agentReputation[executor] = min(
                agentReputation[executor] + boost,
                150 // max reputation cap
            );
        }

        emit ReputationUpdated(executor, oldReputation, agentReputation[executor]);

        attestations[taskId] = Attestation({
            taskId: taskId,
            executor: executor,
            primaryValidator: primaryValidator,
            finalScore: finalScore,
            faultType: faultType,
            paymentReleased: paymentReleased,
            agentSlashed: agentSlashed,
            agentBanned: agentBanned,
            fullReasoningHash: fullReasoningHash,
            timestamp: block.timestamp
        });

        agentHistory[executor].push(taskId);

        emit AttestationWritten(taskId, executor, finalScore, paymentReleased);
    }

    function getAttestation(bytes32 taskId) external view returns (Attestation memory) {
        return attestations[taskId];
    }

    function getAgentReputation(address agent) external view returns (uint256) {
        return agentReputation[agent];
    }

    function getAgentHistory(address agent) external view returns (bytes32[] memory) {
        return agentHistory[agent];
    }

    function isAgentBanned(address agent) external view returns (bool) {
        return bannedAgents[agent];
    }

    function getFailureCount(address agent) external view returns (uint256) {
        return failureCount[agent];
    }

    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
