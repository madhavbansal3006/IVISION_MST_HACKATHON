import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("MachineMandi - Security & Invariant Suite", function () {
  async function deploySecurityFixture() {
    const [owner, buyer, nodeSigner, nodePayout, nonOwner, attacker] = await ethers.getSigners();

    const MachineMandiFactory = await ethers.getContractFactory("MachineMandi");
    const machineMandi = await MachineMandiFactory.deploy();

    const sampleServiceHash = ethers.keccak256(ethers.toUtf8Bytes("3D-PRINTING-SERVICE-V1"));
    const samplePrice = ethers.parseEther("0.25");
    const sampleMinDelta = 50n;

    // Register primary node (Node 1)
    await machineMandi
      .connect(owner)
      .registerNode(nodeSigner.address, nodePayout.address, sampleServiceHash, samplePrice, sampleMinDelta);

    const contractAddress = await machineMandi.getAddress();
    const network = await ethers.provider.getNetwork();

    const domain = {
      name: "MachineMandi",
      version: "1",
      chainId: network.chainId,
      verifyingContract: contractAddress,
    };

    const types = {
      WorkProof: [
        { name: "jobId", type: "uint256" },
        { name: "nodeId", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "startedAt", type: "uint256" },
        { name: "completedAt", type: "uint256" },
        { name: "preReading", type: "uint256" },
        { name: "postReading", type: "uint256" },
        { name: "serviceHash", type: "bytes32" },
      ],
    };

    return {
      machineMandi,
      owner,
      buyer,
      nodeSigner,
      nodePayout,
      nonOwner,
      attacker,
      sampleServiceHash,
      samplePrice,
      sampleMinDelta,
      domain,
      types,
    };
  }

  describe("1. Replay Prevention", function () {
    it("should prevent submitting an identical valid proof twice", async function () {
      const { machineMandi, buyer, nodeSigner, samplePrice, sampleServiceHash, domain, types } =
        await loadFixture(deploySecurityFixture);

      const latestTime = BigInt(await time.latest());
      const deadline = latestTime + 3600n;

      await machineMandi.connect(buyer).createJob(1n, deadline, { value: samplePrice });

      const proofData = {
        jobId: 1n,
        nodeId: 1n,
        nonce: 1n,
        startedAt: latestTime + 10n,
        completedAt: latestTime + 100n,
        preReading: 500n,
        postReading: 600n,
        serviceHash: sampleServiceHash,
      };

      const signature = await nodeSigner.signTypedData(domain, types, proofData);

      // First submission succeeds
      await machineMandi.submitProof(
        proofData.jobId,
        proofData.nodeId,
        proofData.nonce,
        proofData.startedAt,
        proofData.completedAt,
        proofData.preReading,
        proofData.postReading,
        proofData.serviceHash,
        signature
      );

      const job = await machineMandi.getJob(1n);
      expect(job.status).to.equal(1); // COMPLETED = 1

      // Second submission of identical proof must revert because job is no longer OPEN
      await expect(
        machineMandi.submitProof(
          proofData.jobId,
          proofData.nodeId,
          proofData.nonce,
          proofData.startedAt,
          proofData.completedAt,
          proofData.preReading,
          proofData.postReading,
          proofData.serviceHash,
          signature
        )
      ).to.be.revertedWithCustomError(machineMandi, "JobNotOpen");
    });
  });

  describe("2. Cross-Job Proof Reuse", function () {
    it("should prevent reusing a proof signed for Job 1 on Job 2", async function () {
      const { machineMandi, buyer, nodeSigner, samplePrice, sampleServiceHash, domain, types } =
        await loadFixture(deploySecurityFixture);

      const latestTime = BigInt(await time.latest());
      const deadline = latestTime + 3600n;

      // Create Job 1 (jobId = 1, nonce = 1)
      await machineMandi.connect(buyer).createJob(1n, deadline, { value: samplePrice });

      // Create Job 2 (jobId = 2, nonce = 2)
      await machineMandi.connect(buyer).createJob(1n, deadline, { value: samplePrice });

      // Sign proof explicitly crafted for Job 1
      const proofJob1 = {
        jobId: 1n,
        nodeId: 1n,
        nonce: 1n,
        startedAt: latestTime + 10n,
        completedAt: latestTime + 100n,
        preReading: 500n,
        postReading: 600n,
        serviceHash: sampleServiceHash,
      };
      const signatureJob1 = await nodeSigner.signTypedData(domain, types, proofJob1);

      // Attempt A: Try to submit with Job 2's parameters but Job 1's signature
      await expect(
        machineMandi.submitProof(
          2n, // Job 2
          1n,
          2n, // Job 2 nonce
          proofJob1.startedAt,
          proofJob1.completedAt,
          proofJob1.preReading,
          proofJob1.postReading,
          proofJob1.serviceHash,
          signatureJob1
        )
      ).to.be.revertedWithCustomError(machineMandi, "InvalidSigner");

      // Attempt B: Try to submit targeting Job 2 with Job 1's nonce
      await expect(
        machineMandi.submitProof(
          2n, // Target Job 2
          1n,
          1n, // Job 1 nonce mismatch
          proofJob1.startedAt,
          proofJob1.completedAt,
          proofJob1.preReading,
          proofJob1.postReading,
          proofJob1.serviceHash,
          signatureJob1
        )
      ).to.be.revertedWithCustomError(machineMandi, "InvalidNonce");
    });
  });

  describe("3. Refund/Completion Terminal-State Safety", function () {
    it("should prevent submitting proof for a job that was already refunded", async function () {
      const { machineMandi, buyer, nodeSigner, samplePrice, sampleServiceHash, domain, types } =
        await loadFixture(deploySecurityFixture);

      const latestTime = BigInt(await time.latest());
      const deadline = latestTime + 1800n;

      await machineMandi.connect(buyer).createJob(1n, deadline, { value: samplePrice });

      // Advance time past deadline and refund
      await time.increaseTo(deadline + 1n);
      await machineMandi.connect(buyer).refund(1n);

      const job = await machineMandi.getJob(1n);
      expect(job.status).to.equal(2); // REFUNDED = 2

      // Attempt to submit valid proof after refund
      const proofData = {
        jobId: 1n,
        nodeId: 1n,
        nonce: 1n,
        startedAt: latestTime + 10n,
        completedAt: latestTime + 100n,
        preReading: 500n,
        postReading: 600n,
        serviceHash: sampleServiceHash,
      };
      const signature = await nodeSigner.signTypedData(domain, types, proofData);

      await expect(
        machineMandi.submitProof(
          proofData.jobId,
          proofData.nodeId,
          proofData.nonce,
          proofData.startedAt,
          proofData.completedAt,
          proofData.preReading,
          proofData.postReading,
          proofData.serviceHash,
          signature
        )
      ).to.be.revertedWithCustomError(machineMandi, "JobNotOpen");
    });

    it("should prevent refunding a job that was already completed", async function () {
      const { machineMandi, buyer, nodeSigner, samplePrice, sampleServiceHash, domain, types } =
        await loadFixture(deploySecurityFixture);

      const latestTime = BigInt(await time.latest());
      const deadline = latestTime + 1800n;

      await machineMandi.connect(buyer).createJob(1n, deadline, { value: samplePrice });

      // Complete the job with valid proof
      const proofData = {
        jobId: 1n,
        nodeId: 1n,
        nonce: 1n,
        startedAt: latestTime + 10n,
        completedAt: latestTime + 100n,
        preReading: 500n,
        postReading: 600n,
        serviceHash: sampleServiceHash,
      };
      const signature = await nodeSigner.signTypedData(domain, types, proofData);

      await machineMandi.submitProof(
        proofData.jobId,
        proofData.nodeId,
        proofData.nonce,
        proofData.startedAt,
        proofData.completedAt,
        proofData.preReading,
        proofData.postReading,
        proofData.serviceHash,
        signature
      );

      const job = await machineMandi.getJob(1n);
      expect(job.status).to.equal(1); // COMPLETED = 1

      // Advance time past deadline
      await time.increaseTo(deadline + 100n);

      // Attempt refund on completed job must revert
      await expect(machineMandi.connect(buyer).refund(1n)).to.be.revertedWithCustomError(
        machineMandi,
        "JobNotOpen"
      );
    });
  });

  describe("4. Access Control", function () {
    it("should confirm a non-owner cannot register a node", async function () {
      const { machineMandi, nonOwner, nodeSigner, nodePayout, sampleServiceHash, samplePrice, sampleMinDelta } =
        await loadFixture(deploySecurityFixture);

      await expect(
        machineMandi
          .connect(nonOwner)
          .registerNode(nodeSigner.address, nodePayout.address, sampleServiceHash, samplePrice, sampleMinDelta)
      ).to.be.revertedWithCustomError(machineMandi, "NotOwner");
    });

    it("should confirm a non-owner cannot deactivate a node", async function () {
      const { machineMandi, nonOwner } = await loadFixture(deploySecurityFixture);

      await expect(machineMandi.connect(nonOwner).deactivateNode(1n)).to.be.revertedWithCustomError(
        machineMandi,
        "NotOwner"
      );
    });
  });

  describe("5. Job Snapshot Integrity", function () {
    it("should allow a valid proof to settle an already-created job even after node is deactivated", async function () {
      const { machineMandi, owner, buyer, nodeSigner, nodePayout, samplePrice, sampleServiceHash, domain, types } =
        await loadFixture(deploySecurityFixture);

      const latestTime = BigInt(await time.latest());
      const deadline = latestTime + 3600n;

      // Create job while node is active
      await machineMandi.connect(buyer).createJob(1n, deadline, { value: samplePrice });

      // Owner deactivates the node
      await machineMandi.connect(owner).deactivateNode(1n);

      const node = await machineMandi.getNode(1n);
      expect(node.active).to.be.false;

      // Settle the job using the snapshotted parameters
      const proofData = {
        jobId: 1n,
        nodeId: 1n,
        nonce: 1n,
        startedAt: latestTime + 10n,
        completedAt: latestTime + 100n,
        preReading: 100n,
        postReading: 200n,
        serviceHash: sampleServiceHash,
      };
      const signature = await nodeSigner.signTypedData(domain, types, proofData);

      await expect(
        machineMandi.submitProof(
          proofData.jobId,
          proofData.nodeId,
          proofData.nonce,
          proofData.startedAt,
          proofData.completedAt,
          proofData.preReading,
          proofData.postReading,
          proofData.serviceHash,
          signature
        )
      ).to.changeEtherBalances([machineMandi, nodePayout], [-samplePrice, samplePrice]);

      const job = await machineMandi.getJob(1n);
      expect(job.status).to.equal(1); // COMPLETED
    });

    it("should confirm no new job can be created after node deactivation", async function () {
      const { machineMandi, owner, buyer, samplePrice } = await loadFixture(deploySecurityFixture);

      await machineMandi.connect(owner).deactivateNode(1n);

      const deadline = BigInt(await time.latest()) + 3600n;
      await expect(
        machineMandi.connect(buyer).createJob(1n, deadline, { value: samplePrice })
      ).to.be.revertedWithCustomError(machineMandi, "NodeNotActive");
    });
  });

  describe("6. Failed Payout Safety", function () {
    it("should safely revert settlement and retain OPEN status if payout receiver rejects ETH", async function () {
      const { machineMandi, owner, buyer, nodeSigner, samplePrice, sampleServiceHash, domain, types } =
        await loadFixture(deploySecurityFixture);

      // Deploy rejecting receiver contract
      const RejectingReceiverFactory = await ethers.getContractFactory("RejectingReceiver");
      const rejectingReceiver = await RejectingReceiverFactory.deploy();
      const rejectingReceiverAddress = await rejectingReceiver.getAddress();

      // Register Node 2 with rejecting receiver as payout wallet
      await machineMandi
        .connect(owner)
        .registerNode(nodeSigner.address, rejectingReceiverAddress, sampleServiceHash, samplePrice, 50n);

      const latestTime = BigInt(await time.latest());
      const deadline = latestTime + 3600n;

      // Create Job 1 on Node 2
      await machineMandi.connect(buyer).createJob(2n, deadline, { value: samplePrice });

      const proofData = {
        jobId: 1n,
        nodeId: 2n,
        nonce: 1n,
        startedAt: latestTime + 10n,
        completedAt: latestTime + 100n,
        preReading: 100n,
        postReading: 200n,
        serviceHash: sampleServiceHash,
      };
      const signature = await nodeSigner.signTypedData(domain, types, proofData);

      // Submit proof - should revert due to payout transfer rejection
      await expect(
        machineMandi.submitProof(
          proofData.jobId,
          proofData.nodeId,
          proofData.nonce,
          proofData.startedAt,
          proofData.completedAt,
          proofData.preReading,
          proofData.postReading,
          proofData.serviceHash,
          signature
        )
      ).to.be.revertedWithCustomError(machineMandi, "TransferFailed");

      // Verify state was completely rolled back: job remains OPEN and escrow remains in contract
      const job = await machineMandi.getJob(1n);
      expect(job.status).to.equal(0); // STATUS_OPEN
      expect(job.preValue).to.equal(0n);
      expect(job.postValue).to.equal(0n);
      expect(await ethers.provider.getBalance(await machineMandi.getAddress())).to.equal(samplePrice);
    });
  });

  describe("7. Event Integrity", function () {
    it("should verify JobCompleted includes correct jobId, nodeId, buyer, payout, amount, readings, and recoveredSigner", async function () {
      const { machineMandi, buyer, nodeSigner, nodePayout, samplePrice, sampleServiceHash, domain, types } =
        await loadFixture(deploySecurityFixture);

      const latestTime = BigInt(await time.latest());
      const deadline = latestTime + 3600n;

      await machineMandi.connect(buyer).createJob(1n, deadline, { value: samplePrice });

      const proofData = {
        jobId: 1n,
        nodeId: 1n,
        nonce: 1n,
        startedAt: latestTime + 10n,
        completedAt: latestTime + 100n,
        preReading: 1000n,
        postReading: 1500n,
        serviceHash: sampleServiceHash,
      };
      const signature = await nodeSigner.signTypedData(domain, types, proofData);

      await expect(
        machineMandi.submitProof(
          proofData.jobId,
          proofData.nodeId,
          proofData.nonce,
          proofData.startedAt,
          proofData.completedAt,
          proofData.preReading,
          proofData.postReading,
          proofData.serviceHash,
          signature
        )
      )
        .to.emit(machineMandi, "JobCompleted")
        .withArgs(
          1n, // jobId
          1n, // nodeId
          buyer.address, // buyer
          nodePayout.address, // payout address
          samplePrice, // amount
          proofData.preReading, // preReading
          proofData.postReading, // postReading
          nodeSigner.address // recoveredSigner
        );
    });

    it("should verify JobRefunded includes correct jobId, nodeId, buyer, and amount", async function () {
      const { machineMandi, buyer, samplePrice } = await loadFixture(deploySecurityFixture);

      const latestTime = BigInt(await time.latest());
      const deadline = latestTime + 1800n;

      await machineMandi.connect(buyer).createJob(1n, deadline, { value: samplePrice });

      // Advance time past deadline
      await time.increaseTo(deadline + 1n);

      await expect(machineMandi.connect(buyer).refund(1n))
        .to.emit(machineMandi, "JobRefunded")
        .withArgs(
          1n, // jobId
          1n, // nodeId
          buyer.address, // buyer
          samplePrice // amount
        );
    });
  });

  describe("8. Contract-Balance Integrity", function () {
    it("should confirm escrow remains in contract while OPEN and leaves only on settlement or refund without duplicate withdrawal", async function () {
      const { machineMandi, buyer, nodeSigner, nodePayout, samplePrice, sampleServiceHash, domain, types } =
        await loadFixture(deploySecurityFixture);

      const contractAddress = await machineMandi.getAddress();

      // Initial balance is 0
      expect(await ethers.provider.getBalance(contractAddress)).to.equal(0n);

      const latestTime = BigInt(await time.latest());
      const deadline = latestTime + 3600n;

      // 1. Create Job 1: Balance must equal exact escrow amount
      await machineMandi.connect(buyer).createJob(1n, deadline, { value: samplePrice });
      expect(await ethers.provider.getBalance(contractAddress)).to.equal(samplePrice);

      // 2. Complete Job 1: Balance leaves to payout address, contract balance drops to 0
      const proofData = {
        jobId: 1n,
        nodeId: 1n,
        nonce: 1n,
        startedAt: latestTime + 10n,
        completedAt: latestTime + 100n,
        preReading: 500n,
        postReading: 600n,
        serviceHash: sampleServiceHash,
      };
      const signature = await nodeSigner.signTypedData(domain, types, proofData);

      await expect(
        machineMandi.submitProof(
          proofData.jobId,
          proofData.nodeId,
          proofData.nonce,
          proofData.startedAt,
          proofData.completedAt,
          proofData.preReading,
          proofData.postReading,
          proofData.serviceHash,
          signature
        )
      ).to.changeEtherBalances([machineMandi, nodePayout], [-samplePrice, samplePrice]);

      expect(await ethers.provider.getBalance(contractAddress)).to.equal(0n);

      // 3. No duplicate withdrawal via completion
      await expect(
        machineMandi.submitProof(
          proofData.jobId,
          proofData.nodeId,
          proofData.nonce,
          proofData.startedAt,
          proofData.completedAt,
          proofData.preReading,
          proofData.postReading,
          proofData.serviceHash,
          signature
        )
      ).to.be.revertedWithCustomError(machineMandi, "JobNotOpen");

      // 4. No duplicate withdrawal via refund
      await time.increaseTo(deadline + 100n);
      await expect(machineMandi.connect(buyer).refund(1n)).to.be.revertedWithCustomError(
        machineMandi,
        "JobNotOpen"
      );

      // 5. Test escrow departure via refund on Job 2
      const deadline2 = BigInt(await time.latest()) + 1800n;
      await machineMandi.connect(buyer).createJob(1n, deadline2, { value: samplePrice });
      expect(await ethers.provider.getBalance(contractAddress)).to.equal(samplePrice);

      await time.increaseTo(deadline2 + 1n);

      await expect(machineMandi.connect(buyer).refund(2n)).to.changeEtherBalances(
        [machineMandi, buyer],
        [-samplePrice, samplePrice]
      );
      expect(await ethers.provider.getBalance(contractAddress)).to.equal(0n);

      // 6. No duplicate withdrawal after refund
      await expect(machineMandi.connect(buyer).refund(2n)).to.be.revertedWithCustomError(
        machineMandi,
        "JobAlreadyRefunded"
      );
    });
  });
});
