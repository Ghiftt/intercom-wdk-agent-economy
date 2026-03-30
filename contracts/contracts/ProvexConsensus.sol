// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ProvexConsensus {

    enum ConsensusStatus { Pending, Resolved, Disputed }

    struct Vote {
        address validator;
        uint8 score;
        bytes32 justificationHash;
        bool submitted;
    }

    struct ConsensusRound {
        bytes32 taskId;
        address[3] validators;
        mapping(address => Vote) votes;
        uint8 voteCount;
        uint8 finalScore;
        ConsensusStatus status;
        uint256 createdAt;
        uint256 resolvedAt;
        bool executorChallenged;
    }

    mapping(bytes32 => ConsensusRound) public rounds;
    mapping(address => uint256) public validatorStakes;
    mapping(address => uint256) public validatorCorrelation;

    uint256 public constant MIN_VALIDATOR_STAKE = 0.005 ether;
    uint256 public constant CHALLENGE_BOND = 0.01 ether;

    address public protocol;

    event ConsensusStarted(bytes32 indexed taskId, address[3] validators);
    event VoteSubmitted(bytes32 indexed taskId, address validator, uint8 score);
    event ConsensusResolved(bytes32 indexed taskId, uint8 finalScore, ConsensusStatus status);
    event ValidatorPenalized(address indexed validator, uint256 amount, string reason);
    event ExecutorChallenged(bytes32 indexed taskId, address executor);

    constructor() {
        protocol = msg.sender;
    }

    // Stake to become eligible consensus validator
    function stakeAsValidator() external payable {
        require(msg.value >= MIN_VALIDATOR_STAKE, "Insufficient stake");
        validatorStakes[msg.sender] += msg.value;
    }

    // Protocol starts a consensus round with 3 selected validators
    function startConsensus(
        bytes32 taskId,
        address[3] memory selectedValidators
    ) external {
        require(msg.sender == protocol, "Only protocol");
        require(rounds[taskId].createdAt == 0, "Round exists");

        // Verify all validators have staked
        for (uint i = 0; i < 3; i++) {
            require(
                validatorStakes[selectedValidators[i]] >= MIN_VALIDATOR_STAKE,
                "Validator not staked"
            );
        }

        ConsensusRound storage round = rounds[taskId];
        round.taskId = taskId;
        round.validators = selectedValidators;
        round.status = ConsensusStatus.Pending;
        round.createdAt = block.timestamp;

        emit ConsensusStarted(taskId, selectedValidators);
    }

    // Each validator submits their vote
    function submitVote(
        bytes32 taskId,
        uint8 score,
        bytes32 justificationHash
    ) external {
        ConsensusRound storage round = rounds[taskId];
        require(round.status == ConsensusStatus.Pending, "Round not pending");
        require(justificationHash != bytes32(0), "Reasoning required");
        require(!round.votes[msg.sender].submitted, "Already voted");

        // Verify sender is a selected validator
        bool isValidator = false;
        for (uint i = 0; i < 3; i++) {
            if (round.validators[i] == msg.sender) {
                isValidator = true;
                break;
            }
        }
        require(isValidator, "Not a selected validator");

        round.votes[msg.sender] = Vote({
            validator: msg.sender,
            score: score,
            justificationHash: justificationHash,
            submitted: true
        });

        round.voteCount++;
        emit VoteSubmitted(taskId, msg.sender, score);

        // Auto-resolve when all 3 votes are in
        if (round.voteCount == 3) {
            _resolveConsensus(taskId);
        }
    }

    // Internal resolution — majority wins, 1 vote each
    function _resolveConsensus(bytes32 taskId) internal {
        ConsensusRound storage round = rounds[taskId];

        uint8[3] memory scores;
        for (uint i = 0; i < 3; i++) {
            scores[i] = round.votes[round.validators[i]].score;
        }

        // Median of 3 scores — simple sort
        if (scores[0] > scores[1]) (scores[0], scores[1]) = (scores[1], scores[0]);
        if (scores[1] > scores[2]) (scores[1], scores[2]) = (scores[2], scores[1]);
        if (scores[0] > scores[1]) (scores[0], scores[1]) = (scores[1], scores[0]);

        round.finalScore = scores[1]; // median
        round.status = ConsensusStatus.Resolved;
        round.resolvedAt = block.timestamp;

        // Penalize minority validator (furthest from median)
        _penalizeMinority(taskId, round.finalScore);

        emit ConsensusResolved(taskId, round.finalScore, round.status);
    }

    // Penalize validator furthest from consensus
    function _penalizeMinority(bytes32 taskId, uint8 medianScore) internal {
        ConsensusRound storage round = rounds[taskId];

        address minority = round.validators[0];
        uint8 maxDiff = 0;

        for (uint i = 0; i < 3; i++) {
            address v = round.validators[i];
            uint8 score = round.votes[v].score;
            uint8 diff = score > medianScore ? score - medianScore : medianScore - score;

            if (diff > maxDiff) {
                maxDiff = diff;
                minority = v;
            }
        }

        // Only penalize if significantly off (diff > 15)
        if (maxDiff > 15) {
            uint256 penalty = MIN_VALIDATOR_STAKE / 2;
            if (validatorStakes[minority] >= penalty) {
                validatorStakes[minority] -= penalty;
                payable(protocol).transfer(penalty);
                emit ValidatorPenalized(minority, penalty, "Minority score outlier");
            }
        }
    }

    // Executor challenges consensus result
    function challengeResult(bytes32 taskId) external payable {
        require(msg.value >= CHALLENGE_BOND, "Bond required");
        ConsensusRound storage round = rounds[taskId];
        require(round.status == ConsensusStatus.Resolved, "Not resolved");
        require(!round.executorChallenged, "Already challenged");

        round.executorChallenged = true;
        emit ExecutorChallenged(taskId, msg.sender);
    }

    function getRoundValidators(bytes32 taskId) external view returns (address[3] memory) {
        return rounds[taskId].validators;
    }

    function getFinalScore(bytes32 taskId) external view returns (uint8) {
        return rounds[taskId].finalScore;
    }

    function getVoteCount(bytes32 taskId) external view returns (uint8) {
        return rounds[taskId].voteCount;
    }

    function getValidatorStake(address validator) external view returns (uint256) {
        return validatorStakes[validator];
    }
}
