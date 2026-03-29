// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ProvexRegistry {
    enum Status { Active, Banned }

    struct Agent {
        address agentAddress;
        string name;
        string[] capabilities;
        uint256 stake;
        uint256 registeredAt;
        uint256 reputationScore;
        Status status;
    }

    mapping(address => Agent) public agents;
    address[] public agentList;

    uint256 public constant MIN_STAKE = 0.01 ether;

    event AgentRegistered(address indexed agentAddress, string name, uint256 timestamp);
    event AgentBanned(address indexed agentAddress, uint256 timestamp);
    event ReputationUpdated(address indexed agentAddress, uint256 newScore);

    function register(string memory name, string[] memory capabilities) external payable {
        require(msg.value >= MIN_STAKE, "Insufficient stake");
        require(agents[msg.sender].registeredAt == 0, "Already registered");

        agents[msg.sender] = Agent({
            agentAddress: msg.sender,
            name: name,
            capabilities: capabilities,
            stake: msg.value,
            registeredAt: block.timestamp,
            reputationScore: 100,
            status: Status.Active
        });

        agentList.push(msg.sender);
        emit AgentRegistered(msg.sender, name, block.timestamp);
    }

    function banAgent(address agentAddress) external {
        require(agents[agentAddress].registeredAt != 0, "Agent not found");
        agents[agentAddress].status = Status.Banned;
        emit AgentBanned(agentAddress, block.timestamp);
    }

    function updateReputation(address agentAddress, uint256 newScore) external {
        require(agents[agentAddress].registeredAt != 0, "Agent not found");
        agents[agentAddress].reputationScore = newScore;
        emit ReputationUpdated(agentAddress, newScore);
    }

    function getAgent(address agentAddress) external view returns (Agent memory) {
        return agents[agentAddress];
    }

    function getTotalAgents() external view returns (uint256) {
        return agentList.length;
    }
}
