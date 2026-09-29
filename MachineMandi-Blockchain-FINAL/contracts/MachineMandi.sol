// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title MachineMandi
 * @notice Owner-administered escrow protocol with EIP-712 device proof verification.
 * @dev Manages registered machine nodes, escrow lifecycles, and cryptographic job settlement.
 */
contract MachineMandi is EIP712, ReentrancyGuard {
    // --- Data Structures ---

    struct Node {
        address signer;
        address payout;
        bytes32 serviceHash;
        uint256 price;
        uint256 minDelta;
        bool active;
    }

    struct Job {
        uint256 nodeId;
        address buyer;
        uint256 amount;
        uint256 createdAt;
        uint256 deadline;
        uint256 nonce;
        uint8 status;
        uint256 preValue;
        uint256 postValue;
        address signer;
        address payout;
        bytes32 serviceHash;
        uint256 minDelta;
    }

    // --- Status Constants ---

    uint8 public constant STATUS_OPEN = 0;
    uint8 public constant STATUS_COMPLETED = 1;
    uint8 public constant STATUS_REFUNDED = 2;

    // --- Constraints ---

    uint256 public constant MAX_DEADLINE_DURATION = 30 days;

    // --- EIP-712 Typehash ---

    bytes32 public constant WORK_PROOF_TYPEHASH = keccak256(
        "WorkProof(uint256 jobId,uint256 nodeId,uint256 nonce,uint256 startedAt,uint256 completedAt,uint256 preReading,uint256 postReading,bytes32 serviceHash)"
    );

    // --- State Variables ---

    address public owner;
    uint256 public nodeCount;
    uint256 public jobCount;

    mapping(uint256 => Node) public nodes;
    mapping(uint256 => Job) public jobs;

    // --- Events ---

    event NodeRegistered(
        uint256 indexed nodeId,
        address indexed signer,
        address indexed payout,
        bytes32 serviceHash,
        uint256 price,
        uint256 minDelta
    );

    event NodeDeactivated(uint256 indexed nodeId);

    event JobCreated(
        uint256 indexed jobId,
        uint256 indexed nodeId,
        address indexed buyer,
        uint256 amount,
        uint256 deadline,
        uint256 nonce
    );

    event JobRefunded(
        uint256 indexed jobId,
        uint256 indexed nodeId,
        address indexed buyer,
        uint256 amount
    );

    event JobCompleted(
        uint256 indexed jobId,
        uint256 indexed nodeId,
        address indexed buyer,
        address payout,
        uint256 amount,
        uint256 preReading,
        uint256 postReading,
        address recoveredSigner
    );

    // --- Custom Errors ---

    error NotOwner();
    error InvalidSigner();
    error InvalidPayout();
    error InvalidPrice();
    error InvalidServiceHash();
    error NodeNotFound();
    error NodeNotActive();
    error IncorrectPayment();
    error InvalidDeadline();
    error DeadlineTooFar();
    error JobNotFound();
    error JobNotOpen();
    error JobAlreadyRefunded();
    error DeadlineNotPassed();
    error DeadlineExpired();
    error InvalidNodeId();
    error InvalidNonce();
    error InvalidTimestamps();
    error InvalidReadings();
    error InsufficientDelta();
    error TransferFailed();

    // --- Modifiers ---

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // --- Constructor ---

    /**
     * @notice Initializes the MachineMandi contract, setting deployer as owner and configuring EIP-712 domain.
     */
    constructor() EIP712("MachineMandi", "1") {
        owner = msg.sender;
    }

    // --- External Functions ---

    /**
     * @notice Registers a new node in the MachineMandi protocol.
     * @dev Only callable by the contract owner.
     * @param signer The address authorized to sign telemetry proofs for this node.
     * @param payout The address to receive payment upon job completion.
     * @param serviceHash Cryptographic hash representing the service specifications.
     * @param price The exact payment amount required to create a job for this node.
     * @param minDelta The minimum delta value required for job verification.
     * @return nodeId The unique identifier of the registered node.
     */
    function registerNode(
        address signer,
        address payout,
        bytes32 serviceHash,
        uint256 price,
        uint256 minDelta
    ) external onlyOwner returns (uint256 nodeId) {
        if (signer == address(0)) revert InvalidSigner();
        if (payout == address(0)) revert InvalidPayout();
        if (price == 0) revert InvalidPrice();
        if (serviceHash == bytes32(0)) revert InvalidServiceHash();

        nodeId = ++nodeCount;
        nodes[nodeId] = Node({
            signer: signer,
            payout: payout,
            serviceHash: serviceHash,
            price: price,
            minDelta: minDelta,
            active: true
        });

        emit NodeRegistered(nodeId, signer, payout, serviceHash, price, minDelta);
    }

    /**
     * @notice Deactivates an existing active node.
     * @dev Only callable by the contract owner. Reverts if node does not exist or is already inactive.
     * @param nodeId The unique identifier of the node to deactivate.
     */
    function deactivateNode(uint256 nodeId) external onlyOwner {
        if (nodeId == 0 || nodeId > nodeCount) revert NodeNotFound();
        Node storage node = nodes[nodeId];
        if (!node.active) revert NodeNotActive();

        node.active = false;
        emit NodeDeactivated(nodeId);
    }

    /**
     * @notice Creates a new escrow job for a specified node.
     * @dev Caller must send the exact price of the node as native currency (ETH).
     * @param nodeId The unique identifier of the target node.
     * @param deadline The unix timestamp before which the job must be completed.
     * @return jobId The unique identifier of the created job.
     */
    function createJob(
        uint256 nodeId,
        uint256 deadline
    ) external payable nonReentrant returns (uint256 jobId) {
        if (nodeId == 0 || nodeId > nodeCount) revert NodeNotFound();
        Node storage node = nodes[nodeId];
        if (!node.active) revert NodeNotActive();
        if (msg.value != node.price) revert IncorrectPayment();
        if (deadline <= block.timestamp) revert InvalidDeadline();
        if (deadline > block.timestamp + MAX_DEADLINE_DURATION) revert DeadlineTooFar();

        jobId = ++jobCount;
        uint256 nonce = jobId;

        jobs[jobId] = Job({
            nodeId: nodeId,
            buyer: msg.sender,
            amount: msg.value,
            createdAt: block.timestamp,
            deadline: deadline,
            nonce: nonce,
            status: STATUS_OPEN,
            preValue: 0,
            postValue: 0,
            signer: node.signer,
            payout: node.payout,
            serviceHash: node.serviceHash,
            minDelta: node.minDelta
        });

        emit JobCreated(jobId, nodeId, msg.sender, msg.value, deadline, nonce);
    }

    /**
     * @notice Submits a signed EIP-712 work proof to verify device execution and settle escrow payout.
     * @dev Follows Checks-Effects-Interactions pattern. Status is set to COMPLETED before payout transfer.
     * @param jobId The unique identifier of the job being completed.
     * @param nodeId The identifier of the node that performed the work.
     * @param nonce The job nonce matching the created job.
     * @param startedAt The timestamp when the machine work began.
     * @param completedAt The timestamp when the machine work finished.
     * @param preReading The initial sensor/telemetry reading before execution.
     * @param postReading The final sensor/telemetry reading after execution.
     * @param serviceHash The service specification hash matching the job.
     * @param signature The EIP-712 signature produced by the authorized device signer.
     */
    function submitProof(
        uint256 jobId,
        uint256 nodeId,
        uint256 nonce,
        uint256 startedAt,
        uint256 completedAt,
        uint256 preReading,
        uint256 postReading,
        bytes32 serviceHash,
        bytes calldata signature
    ) external nonReentrant {
        if (jobId == 0 || jobId > jobCount) revert JobNotFound();

        Job storage job = jobs[jobId];
        if (job.status != STATUS_OPEN) revert JobNotOpen();
        if (block.timestamp > job.deadline) revert DeadlineExpired();
        if (nodeId != job.nodeId) revert InvalidNodeId();
        if (nonce != job.nonce) revert InvalidNonce();
        if (serviceHash != job.serviceHash) revert InvalidServiceHash();
        if (completedAt < startedAt) revert InvalidTimestamps();
        if (postReading <= preReading) revert InvalidReadings();
        if (postReading - preReading < job.minDelta) revert InsufficientDelta();

        bytes32 digest = _hashWorkProof(
            jobId,
            nodeId,
            nonce,
            startedAt,
            completedAt,
            preReading,
            postReading,
            serviceHash
        );

        address recoveredSigner = ECDSA.recover(digest, signature);
        if (recoveredSigner != job.signer) revert InvalidSigner();

        _settleJob(jobId, job, preReading, postReading, recoveredSigner);
    }

    /**
     * @notice Refunds an expired, open job back to the buyer.
     * @dev Follows Checks-Effects-Interactions pattern. Status is set to REFUNDED before transfer.
     * @param jobId The unique identifier of the job to refund.
     */
    function refund(uint256 jobId) external nonReentrant {
        if (jobId == 0 || jobId > jobCount) revert JobNotFound();

        Job storage job = jobs[jobId];
        if (job.status == STATUS_REFUNDED) revert JobAlreadyRefunded();
        if (job.status != STATUS_OPEN) revert JobNotOpen();
        if (block.timestamp <= job.deadline) revert DeadlineNotPassed();

        address payable buyer = payable(job.buyer);
        uint256 amount = job.amount;

        uint256 nodeId = job.nodeId;

        // Effects
        job.status = STATUS_REFUNDED;

        emit JobRefunded(jobId, nodeId, buyer, amount);

        // Interactions
        (bool success, ) = buyer.call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    /**
     * @notice Retrieves node details by ID.
     * @param nodeId The unique identifier of the node.
     * @return The Node struct.
     */
    function getNode(uint256 nodeId) external view returns (Node memory) {
        if (nodeId == 0 || nodeId > nodeCount) revert NodeNotFound();
        return nodes[nodeId];
    }

    /**
     * @notice Retrieves job details by ID.
     * @param jobId The unique identifier of the job.
     * @return The Job struct.
     */
    function getJob(uint256 jobId) external view returns (Job memory) {
        if (jobId == 0 || jobId > jobCount) revert JobNotFound();
        return jobs[jobId];
    }

    // --- Internal Helpers ---

    /**
     * @dev Computes the EIP-712 typed data digest for a WorkProof struct.
     */
    function _hashWorkProof(
        uint256 jobId,
        uint256 nodeId,
        uint256 nonce,
        uint256 startedAt,
        uint256 completedAt,
        uint256 preReading,
        uint256 postReading,
        bytes32 serviceHash
    ) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                WORK_PROOF_TYPEHASH,
                jobId,
                nodeId,
                nonce,
                startedAt,
                completedAt,
                preReading,
                postReading,
                serviceHash
            )
        );
        return _hashTypedDataV4(structHash);
    }

    /**
     * @dev Settles job completion state and transfers escrow payment to the node payout address.
     */
    function _settleJob(
        uint256 jobId,
        Job storage job,
        uint256 preReading,
        uint256 postReading,
        address recoveredSigner
    ) internal {
        // Effects
        job.preValue = preReading;
        job.postValue = postReading;
        job.status = STATUS_COMPLETED;

        address payout = job.payout;
        uint256 amount = job.amount;
        uint256 nodeId = job.nodeId;
        address buyer = job.buyer;

        emit JobCompleted(
            jobId,
            nodeId,
            buyer,
            payout,
            amount,
            preReading,
            postReading,
            recoveredSigner
        );

        // Interactions
        (bool success, ) = payable(payout).call{value: amount}("");
        if (!success) revert TransferFailed();
    }
}
