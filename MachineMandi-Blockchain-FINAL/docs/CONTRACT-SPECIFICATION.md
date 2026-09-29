# MachineMandi Smart Contract Specification

> **Contract Source**: [`contracts/MachineMandi.sol`](file:///c:/Users/SRIRAM/OneDrive/Desktop/MST-Integration-Hardhat-Deployment-Engineer/MachineMandi-Blockchain-FINAL/contracts/MachineMandi.sol)  
> **Deployed Address**: `0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE`  
> **Target Network**: MST Testnet (Chain ID `91562037`)  
> **Solidity Version**: `0.8.20` | **Target EVM**: `paris`  
> **Inheritance**: `EIP712("MachineMandi", "1")`, `ReentrancyGuard`

---

## 1. On-Chain Data Structures

### `Node` Struct
Represents an authorized machine registered in the protocol by the contract owner.
```solidity
struct Node {
    address signer;      // Authorized hardware device key that signs telemetry
    address payout;      // Wallet receiving escrow settlement upon completion
    bytes32 serviceHash; // Cryptographic hash representing machine service specs
    uint256 price;       // Fixed price in native wei required to create a job
    uint256 minDelta;    // Minimum required telemetry increment (postReading - preReading)
    bool active;         // Operational status (true = active, false = deactivated)
}
```

### `Job` Struct
Represents an individual escrow reservation created by a buyer for a designated node.
```solidity
struct Job {
    uint256 nodeId;      // ID of the designated node
    address buyer;       // Buyer funding the escrow
    uint256 amount;      // Escrowed amount in native wei (must match node.price)
    uint256 createdAt;   // Unix timestamp of job creation
    uint256 deadline;    // Execution cutoff timestamp (max 30 days)
    uint256 nonce;       // Replay-prevention nonce (set equal to jobId)
    uint8 status;        // 0 = OPEN, 1 = COMPLETED, 2 = REFUNDED
    uint256 preValue;    // Telemetry reading before execution (recorded on completion)
    uint256 postValue;   // Telemetry reading after execution (recorded on completion)
    address signer;      // Snapshotted authorized signer
    address payout;      // Snapshotted payout receiver
    bytes32 serviceHash; // Snapshotted service specification hash
    uint256 minDelta;    // Snapshotted minimum required delta
}
```

### Status Constants
```solidity
uint8 public constant STATUS_OPEN = 0;       // Job created and escrow funded
uint8 public constant STATUS_COMPLETED = 1;  // Proof verified, payout released (Terminal)
uint8 public constant STATUS_REFUNDED = 2;   // Deadline expired, escrow returned (Terminal)
```

---

## 2. Immutable Node Architecture

> [!IMPORTANT]
> **THERE IS NO `updateNode()` FUNCTION IN `MachineMandi.sol`.**
> When a node is registered, its terms (`signer`, `payout`, `serviceHash`, `price`, `minDelta`) are **IMMUTABLE** for that `nodeId`.

- When a job is created, all node parameters are snapshotted into the `Job` struct.
- If terms, hardware keys, pricing, or payout destinations change:
  1. Owner calls `deactivateNode(nodeId)` to deactivate the old node.
  2. Owner calls `registerNode(...)` to register a new node configuration, obtaining a new `nodeId`.
- Previously funded open jobs associated with the old node remain valid and will settle using their snapshotted terms.

---

## 3. Externally Callable Functions

### Administrative Functions (Owner Only)

#### `registerNode`
```solidity
function registerNode(
    address signer,
    address payout,
    bytes32 serviceHash,
    uint256 price,
    uint256 minDelta
) external onlyOwner returns (uint256 nodeId);
```
- **Description**: Registers a new machine node and increments `nodeCount`.
- **Validation**:
  - `signer != address(0)` (else `InvalidSigner()`)
  - `payout != address(0)` (else `InvalidPayout()`)
  - `price > 0` (else `InvalidPrice()`)
  - `serviceHash != bytes32(0)` (else `InvalidServiceHash()`)
- **Emits**: `NodeRegistered(nodeId, signer, payout, serviceHash, price, minDelta)`

#### `deactivateNode`
```solidity
function deactivateNode(uint256 nodeId) external onlyOwner;
```
- **Description**: Marks an active node as inactive. Inactive nodes cannot accept new jobs.
- **Validation**:
  - `nodeId > 0 && nodeId <= nodeCount` (else `NodeNotFound()`)
  - `nodes[nodeId].active == true` (else `NodeNotActive()`)
- **Emits**: `NodeDeactivated(nodeId)`

---

### Core Escrow & Settlement Functions

#### `createJob`
```solidity
function createJob(
    uint256 nodeId,
    uint256 deadline
) external payable nonReentrant returns (uint256 jobId);
```
- **Description**: Locks native MST in escrow to create a new job.
- **Validation**:
  - `nodeId > 0 && nodeId <= nodeCount` (else `NodeNotFound()`)
  - `nodes[nodeId].active == true` (else `NodeNotActive()`)
  - `msg.value == node.price` (else `IncorrectPayment()`)
  - `deadline > block.timestamp` (else `InvalidDeadline()`)
  - `deadline <= block.timestamp + 30 days` (else `DeadlineTooFar()`)
- **Effects**:
  - Increments `jobCount`, setting `jobId = jobCount` and `nonce = jobId`.
  - Snapshots `signer`, `payout`, `serviceHash`, `minDelta` from target node.
  - Sets `job.status = STATUS_OPEN` (0).
- **Emits**: `JobCreated(jobId, nodeId, msg.sender, msg.value, deadline, nonce)`

#### `submitProof`
```solidity
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
) external nonReentrant;
```
- **Description**: Submits an EIP-712 WorkProof signed by the machine's private key. Releases escrow to `job.payout`.
- **Validation**:
  - `jobId > 0 && jobId <= jobCount` (else `JobNotFound()`)
  - `job.status == STATUS_OPEN` (else `JobNotOpen()`)
  - `block.timestamp <= job.deadline` (else `DeadlineExpired()`)
  - `nodeId == job.nodeId` (else `InvalidNodeId()`)
  - `nonce == job.nonce` (else `InvalidNonce()`)
  - `serviceHash == job.serviceHash` (else `InvalidServiceHash()`)
  - `completedAt >= startedAt` (else `InvalidTimestamps()`)
  - `postReading > preReading` (else `InvalidReadings()`)
  - `postReading - preReading >= job.minDelta` (else `InsufficientDelta()`)
  - `ECDSA.recover(digest, signature) == job.signer` (else `InvalidSigner()`)
- **Effects (Checks-Effects-Interactions)**:
  - `job.preValue = preReading`
  - `job.postValue = postReading`
  - `job.status = STATUS_COMPLETED` (1)
  - Emits `JobCompleted(jobId, nodeId, job.buyer, job.payout, job.amount, preReading, postReading, recoveredSigner)`
  - Transfers `job.amount` to `job.payout` via `.call{value: amount}("")` (reverts `TransferFailed()` on failure).

#### `refund`
```solidity
function refund(uint256 jobId) external nonReentrant;
```
- **Description**: Reclaims escrowed native MST if deadline passed and job remains open.
- **Validation**:
  - `jobId > 0 && jobId <= jobCount` (else `JobNotFound()`)
  - `job.status != STATUS_REFUNDED` (else `JobAlreadyRefunded()`)
  - `job.status == STATUS_OPEN` (else `JobNotOpen()`)
  - `block.timestamp > job.deadline` (else `DeadlineNotPassed()`)
- **Effects (Checks-Effects-Interactions)**:
  - `job.status = STATUS_REFUNDED` (2)
  - Emits `JobRefunded(jobId, nodeId, job.buyer, job.amount)`
  - Transfers `job.amount` to `job.buyer` via `.call{value: amount}("")` (reverts `TransferFailed()` on failure).

---

### View Functions

- `getNode(uint256 nodeId) external view returns (Node memory)`
- `getJob(uint256 jobId) external view returns (Job memory)`
- `owner() external view returns (address)`
- `nodeCount() external view returns (uint256)`
- `jobCount() external view returns (uint256)`
- `nodes(uint256) external view returns (...)`
- `jobs(uint256) external view returns (...)`
- `MAX_DEADLINE_DURATION() external view returns (uint256)`: Returns `2592000` (30 days).
- `WORK_PROOF_TYPEHASH() external view returns (bytes32)`: Returns `0x48ae153724c885fa2d97c36a4aa44bca1fcf7dfdf46296c00ffcfa6c4cb72e70`.
- `eip712Domain() external view returns (...)`

---

## 4. Contract Events

```solidity
event NodeRegistered(uint256 indexed nodeId, address indexed signer, address indexed payout, bytes32 serviceHash, uint256 price, uint256 minDelta);
event NodeDeactivated(uint256 indexed nodeId);
event JobCreated(uint256 indexed jobId, uint256 indexed nodeId, address indexed buyer, uint256 amount, uint256 deadline, uint256 nonce);
event JobRefunded(uint256 indexed jobId, uint256 indexed nodeId, address indexed buyer, uint256 amount);
event JobCompleted(uint256 indexed jobId, uint256 indexed nodeId, address indexed buyer, address payout, uint256 amount, uint256 preReading, uint256 postReading, address recoveredSigner);
```

---

## 5. Custom Errors

```solidity
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
```
