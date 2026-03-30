// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ProvexEscrow {
    enum TaskStatus { Pending, Active, Completed, Failed, Disputed }

    struct Task {
        address poster;
        address executor;
        uint256 payment;
        uint256 validationFee;
        uint256 deadline;
        TaskStatus status;
        uint8 tier; // 0=Basic, 1=Standard, 2=HighAssurance
        bytes32 slaHash;
        bytes32 receiptHash;
        uint256 createdAt;
    }

    mapping(bytes32 => Task) public tasks;
    bytes32[] public taskList;

    uint256 public protocolFee = 5;
    address public protocol;

    event TaskPosted(bytes32 indexed taskId, address poster, uint256 payment, uint8 tier);
    event TaskAccepted(bytes32 indexed taskId, address executor, bytes32 slaHash);
    event TaskCompleted(bytes32 indexed taskId, bytes32 receiptHash);
    event TaskFailed(bytes32 indexed taskId, string reason);
    event PaymentReleased(bytes32 indexed taskId, address executor, uint256 amount);
    event PaymentRefunded(bytes32 indexed taskId, address poster, uint256 amount);

    constructor() {
        protocol = msg.sender;
    }

    function postTask(uint256 deadline, uint8 tier) external payable returns (bytes32) {
        require(msg.value > 0, "Payment required");
        require(tier <= 2, "Invalid tier");

        bytes32 taskId = keccak256(abi.encodePacked(
            msg.sender, block.timestamp, msg.value
        ));

        uint256 validationFee = (msg.value * 13) / 100;
        uint256 executorPayment = msg.value - validationFee;

        tasks[taskId] = Task({
            poster: msg.sender,
            executor: address(0),
            payment: executorPayment,
            validationFee: validationFee,
            deadline: block.timestamp + deadline,
            status: TaskStatus.Pending,
            tier: tier,
            slaHash: bytes32(0),
            receiptHash: bytes32(0),
            createdAt: block.timestamp
        });

        taskList.push(taskId);
        emit TaskPosted(taskId, msg.sender, msg.value, tier);
        return taskId;
    }

    function acceptTask(bytes32 taskId, bytes32 slaHash) external {
        Task storage task = tasks[taskId];
        require(task.status == TaskStatus.Pending, "Task not available");
        require(task.poster != msg.sender, "Poster cannot execute");

        task.executor = msg.sender;
        task.slaHash = slaHash;
        task.status = TaskStatus.Active;

        emit TaskAccepted(taskId, msg.sender, slaHash);
    }

    function submitReceipt(bytes32 taskId, bytes32 receiptHash) external {
        Task storage task = tasks[taskId];
        require(task.executor == msg.sender, "Not executor");
        require(task.status == TaskStatus.Active, "Task not active");
        require(block.timestamp <= task.deadline, "Deadline missed");

        task.receiptHash = receiptHash;
        task.status = TaskStatus.Completed;

        emit TaskCompleted(taskId, receiptHash);
    }

    function releasePayment(bytes32 taskId) external {
        Task storage task = tasks[taskId];
        require(task.status == TaskStatus.Completed, "Not completed");
        require(msg.sender == protocol, "Only protocol");

        uint256 protocolCut = (task.payment * protocolFee) / 100;
        uint256 executorCut = task.payment - protocolCut;

        payable(task.executor).transfer(executorCut);
        payable(protocol).transfer(protocolCut);

        emit PaymentReleased(taskId, task.executor, executorCut);
    }

    function refundPayment(bytes32 taskId) external {
        Task storage task = tasks[taskId];
        require(task.status == TaskStatus.Completed || 
                task.status == TaskStatus.Active, "Cannot refund");
        require(msg.sender == protocol, "Only protocol");

        task.status = TaskStatus.Failed;
        uint256 refund = task.payment + task.validationFee;
        payable(task.poster).transfer(refund);

        emit PaymentRefunded(taskId, task.poster, refund);
    }

    function getTask(bytes32 taskId) external view returns (Task memory) {
        return tasks[taskId];
    }

    function getTotalTasks() external view returns (uint256) {
        return taskList.length;
    }
}
