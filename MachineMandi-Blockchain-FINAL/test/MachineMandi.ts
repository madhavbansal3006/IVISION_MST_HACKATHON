import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("MachineMandi", function () {
  async function deployMachineMandiFixture() {
    const [owner, buyer, nodeSigner, nodePayout, other] = await ethers.getSigners();

    const MachineMandiFactory = await ethers.getContractFactory("MachineMandi");
    const machineMandi = await MachineMandiFactory.deploy();

    const sampleServiceHash = ethers.keccak256(ethers.toUtf8Bytes("3D-PRINTING-SERVICE-V1"));
    const samplePrice = ethers.parseEther("0.05");
    const sampleMinDelta = 100n;

    return {
      machineMandi,
      owner,
      buyer,
      nodeSigner,
      nodePayout,
      other,
      sampleServiceHash,
      samplePrice,
      sampleMinDelta,
    };
  }

  describe("Deployment & Ownership", function () {
    it("should set deployer as the initial owner", async function () {
      const { machineMandi, owner } = await loadFixture(deployMachineMandiFixture);
      expect(await machineMandi.owner()).to.equal(owner.address);
    });
  });

  describe("Node Registration", function () {
    it("should allow the owner to register a node with valid parameters", async function () {
      const { machineMandi, owner, nodeSigner, nodePayout, sampleServiceHash, samplePrice, sampleMinDelta } =
        await loadFixture(deployMachineMandiFixture);

      await expect(
        machineMandi
          .connect(owner)
          .registerNode(nodeSigner.address, nodePayout.address, sampleServiceHash, samplePrice, sampleMinDelta)
      )
        .to.emit(machineMandi, "NodeRegistered")
        .withArgs(1n, nodeSigner.address, nodePayout.address, sampleServiceHash, samplePrice, sampleMinDelta);

      expect(await machineMandi.nodeCount()).to.equal(1n);

      const node = await machineMandi.getNode(1n);
      expect(node.signer).to.equal(nodeSigner.address);
      expect(node.payout).to.equal(nodePayout.address);
      expect(node.serviceHash).to.equal(sampleServiceHash);
      expect(node.price).to.equal(samplePrice);
      expect(node.minDelta).to.equal(sampleMinDelta);
      expect(node.active).to.be.true;
    });

    it("should reject node registration by non-owner", async function () {
      const { machineMandi, other, nodeSigner, nodePayout, sampleServiceHash, samplePrice, sampleMinDelta } =
        await loadFixture(deployMachineMandiFixture);

      await expect(
        machineMandi
          .connect(other)
          .registerNode(nodeSigner.address, nodePayout.address, sampleServiceHash, samplePrice, sampleMinDelta)
      ).to.be.revertedWithCustomError(machineMandi, "NotOwner");
    });

    it("should reject node deactivation by non-owner", async function () {
      const { machineMandi, owner, other, nodeSigner, nodePayout, sampleServiceHash, samplePrice, sampleMinDelta } =
        await loadFixture(deployMachineMandiFixture);

      await machineMandi
        .connect(owner)
        .registerNode(nodeSigner.address, nodePayout.address, sampleServiceHash, samplePrice, sampleMinDelta);

      await expect(machineMandi.connect(other).deactivateNode(1n)).to.be.revertedWithCustomError(
        machineMandi,
        "NotOwner"
      );
    });

    it("should reject node registration with zero signer address", async function () {
      const { machineMandi, owner, nodePayout, sampleServiceHash, samplePrice, sampleMinDelta } =
        await loadFixture(deployMachineMandiFixture);

      await expect(
        machineMandi
          .connect(owner)
          .registerNode(ethers.ZeroAddress, nodePayout.address, sampleServiceHash, samplePrice, sampleMinDelta)
      ).to.be.revertedWithCustomError(machineMandi, "InvalidSigner");
    });

    it("should reject node registration with zero payout address", async function () {
      const { machineMandi, owner, nodeSigner, sampleServiceHash, samplePrice, sampleMinDelta } =
        await loadFixture(deployMachineMandiFixture);

      await expect(
        machineMandi
          .connect(owner)
          .registerNode(nodeSigner.address, ethers.ZeroAddress, sampleServiceHash, samplePrice, sampleMinDelta)
      ).to.be.revertedWithCustomError(machineMandi, "InvalidPayout");
    });

    it("should reject node registration with zero price", async function () {
      const { machineMandi, owner, nodeSigner, nodePayout, sampleServiceHash, sampleMinDelta } =
        await loadFixture(deployMachineMandiFixture);

      await expect(
        machineMandi
          .connect(owner)
          .registerNode(nodeSigner.address, nodePayout.address, sampleServiceHash, 0n, sampleMinDelta)
      ).to.be.revertedWithCustomError(machineMandi, "InvalidPrice");
    });

    it("should reject node registration with zero service hash", async function () {
      const { machineMandi, owner, nodeSigner, nodePayout, samplePrice, sampleMinDelta } =
        await loadFixture(deployMachineMandiFixture);

      await expect(
        machineMandi
          .connect(owner)
          .registerNode(nodeSigner.address, nodePayout.address, ethers.ZeroHash, samplePrice, sampleMinDelta)
      ).to.be.revertedWithCustomError(machineMandi, "InvalidServiceHash");
    });
  });

  describe("Node Deactivation", function () {
    it("should allow owner to deactivate an active node", async function () {
      const { machineMandi, owner, nodeSigner, nodePayout, sampleServiceHash, samplePrice, sampleMinDelta } =
        await loadFixture(deployMachineMandiFixture);

      await machineMandi
        .connect(owner)
        .registerNode(nodeSigner.address, nodePayout.address, sampleServiceHash, samplePrice, sampleMinDelta);

      await expect(machineMandi.connect(owner).deactivateNode(1n))
        .to.emit(machineMandi, "NodeDeactivated")
        .withArgs(1n);

      const node = await machineMandi.getNode(1n);
      expect(node.active).to.be.false;
    });

    it("should reject deactivating an already deactivated node", async function () {
      const { machineMandi, owner, nodeSigner, nodePayout, sampleServiceHash, samplePrice, sampleMinDelta } =
        await loadFixture(deployMachineMandiFixture);

      await machineMandi
        .connect(owner)
        .registerNode(nodeSigner.address, nodePayout.address, sampleServiceHash, samplePrice, sampleMinDelta);

      await machineMandi.connect(owner).deactivateNode(1n);

      await expect(machineMandi.connect(owner).deactivateNode(1n)).to.be.revertedWithCustomError(
        machineMandi,
        "NodeNotActive"
      );
    });

    it("should reject deactivating a non-existent node", async function () {
      const { machineMandi, owner } = await loadFixture(deployMachineMandiFixture);

      await expect(machineMandi.connect(owner).deactivateNode(99n)).to.be.revertedWithCustomError(
        machineMandi,
        "NodeNotFound"
      );
    });
  });

  describe("Job Creation", function () {
    it("should create a job with correct payment, snapshotting node details and setting status to OPEN", async function () {
      const { machineMandi, owner, buyer, nodeSigner, nodePayout, sampleServiceHash, samplePrice, sampleMinDelta } =
        await loadFixture(deployMachineMandiFixture);

      await machineMandi
        .connect(owner)
        .registerNode(nodeSigner.address, nodePayout.address, sampleServiceHash, samplePrice, sampleMinDelta);

      const latestBlockTime = await time.latest();
      const deadline = BigInt(latestBlockTime) + 3600n; // 1 hour in future

      await expect(
        machineMandi.connect(buyer).createJob(1n, deadline, { value: samplePrice })
      )
        .to.emit(machineMandi, "JobCreated")
        .withArgs(1n, 1n, buyer.address, samplePrice, deadline, 1n);

      expect(await machineMandi.jobCount()).to.equal(1n);

      const job = await machineMandi.getJob(1n);
      expect(job.nodeId).to.equal(1n);
      expect(job.buyer).to.equal(buyer.address);
      expect(job.amount).to.equal(samplePrice);
      expect(job.deadline).to.equal(deadline);
      expect(job.nonce).to.equal(1n);
      expect(job.status).to.equal(0); // OPEN = 0
      expect(job.preValue).to.equal(0n);
      expect(job.postValue).to.equal(0n);

      // Snapshot verification
      expect(job.signer).to.equal(nodeSigner.address);
      expect(job.payout).to.equal(nodePayout.address);
      expect(job.serviceHash).to.equal(sampleServiceHash);
      expect(job.minDelta).to.equal(sampleMinDelta);
    });

    it("should preserve snapshotted node values in job even if node is subsequently deactivated", async function () {
      const { machineMandi, owner, buyer, nodeSigner, nodePayout, sampleServiceHash, samplePrice, sampleMinDelta } =
        await loadFixture(deployMachineMandiFixture);

      await machineMandi
        .connect(owner)
        .registerNode(nodeSigner.address, nodePayout.address, sampleServiceHash, samplePrice, sampleMinDelta);

      const deadline = BigInt(await time.latest()) + 3600n;
      await machineMandi.connect(buyer).createJob(1n, deadline, { value: samplePrice });

      // Owner deactivates the node
      await machineMandi.connect(owner).deactivateNode(1n);

      // Verify job still retains original snapshotted parameters
      const job = await machineMandi.getJob(1n);
      expect(job.signer).to.equal(nodeSigner.address);
      expect(job.payout).to.equal(nodePayout.address);
      expect(job.serviceHash).to.equal(sampleServiceHash);
      expect(job.minDelta).to.equal(sampleMinDelta);
      expect(job.status).to.equal(0);
    });

    it("should reject job creation if payment is lower than required node price", async function () {
      const { machineMandi, owner, buyer, nodeSigner, nodePayout, sampleServiceHash, samplePrice, sampleMinDelta } =
        await loadFixture(deployMachineMandiFixture);

      await machineMandi
        .connect(owner)
        .registerNode(nodeSigner.address, nodePayout.address, sampleServiceHash, samplePrice, sampleMinDelta);

      const deadline = BigInt(await time.latest()) + 3600n;
      const underpayment = samplePrice - 1n;

      await expect(
        machineMandi.connect(buyer).createJob(1n, deadline, { value: underpayment })
      ).to.be.revertedWithCustomError(machineMandi, "IncorrectPayment");
    });

    it("should reject job creation if payment is higher than required node price", async function () {
      const { machineMandi, owner, buyer, nodeSigner, nodePayout, sampleServiceHash, samplePrice, sampleMinDelta } =
        await loadFixture(deployMachineMandiFixture);

      await machineMandi
        .connect(owner)
        .registerNode(nodeSigner.address, nodePayout.address, sampleServiceHash, samplePrice, sampleMinDelta);

      const deadline = BigInt(await time.latest()) + 3600n;
      const overpayment = samplePrice + ethers.parseEther("0.01");

      await expect(
        machineMandi.connect(buyer).createJob(1n, deadline, { value: overpayment })
      ).to.be.revertedWithCustomError(machineMandi, "IncorrectPayment");
    });

    it("should reject job creation with zero payment", async function () {
      const { machineMandi, owner, buyer, nodeSigner, nodePayout, sampleServiceHash, samplePrice, sampleMinDelta } =
        await loadFixture(deployMachineMandiFixture);

      await machineMandi
        .connect(owner)
        .registerNode(nodeSigner.address, nodePayout.address, sampleServiceHash, samplePrice, sampleMinDelta);

      const deadline = BigInt(await time.latest()) + 3600n;

      await expect(
        machineMandi.connect(buyer).createJob(1n, deadline, { value: 0n })
      ).to.be.revertedWithCustomError(machineMandi, "IncorrectPayment");
    });

    it("should reject job creation on a deactivated node", async function () {
      const { machineMandi, owner, buyer, nodeSigner, nodePayout, sampleServiceHash, samplePrice, sampleMinDelta } =
        await loadFixture(deployMachineMandiFixture);

      await machineMandi
        .connect(owner)
        .registerNode(nodeSigner.address, nodePayout.address, sampleServiceHash, samplePrice, sampleMinDelta);

      await machineMandi.connect(owner).deactivateNode(1n);

      const deadline = BigInt(await time.latest()) + 3600n;

      await expect(
        machineMandi.connect(buyer).createJob(1n, deadline, { value: samplePrice })
      ).to.be.revertedWithCustomError(machineMandi, "NodeNotActive");
    });

    it("should reject job creation on a non-existent node", async function () {
      const { machineMandi, buyer, samplePrice } = await loadFixture(deployMachineMandiFixture);

      const deadline = BigInt(await time.latest()) + 3600n;

      await expect(
        machineMandi.connect(buyer).createJob(999n, deadline, { value: samplePrice })
      ).to.be.revertedWithCustomError(machineMandi, "NodeNotFound");
    });

    it("should reject job creation with past or current deadline", async function () {
      const { machineMandi, owner, buyer, nodeSigner, nodePayout, sampleServiceHash, samplePrice, sampleMinDelta } =
        await loadFixture(deployMachineMandiFixture);

      await machineMandi
        .connect(owner)
        .registerNode(nodeSigner.address, nodePayout.address, sampleServiceHash, samplePrice, sampleMinDelta);

      const currentBlockTime = BigInt(await time.latest());

      await expect(
        machineMandi.connect(buyer).createJob(1n, currentBlockTime, { value: samplePrice })
      ).to.be.revertedWithCustomError(machineMandi, "InvalidDeadline");
    });

    it("should reject job creation exceeding maximum deadline duration", async function () {
      const { machineMandi, owner, buyer, nodeSigner, nodePayout, sampleServiceHash, samplePrice, sampleMinDelta } =
        await loadFixture(deployMachineMandiFixture);

      await machineMandi
        .connect(owner)
        .registerNode(nodeSigner.address, nodePayout.address, sampleServiceHash, samplePrice, sampleMinDelta);

      const currentBlockTime = BigInt(await time.latest());
      const tooFarDeadline = currentBlockTime + (30n * 86400n) + 100n;

      await expect(
        machineMandi.connect(buyer).createJob(1n, tooFarDeadline, { value: samplePrice })
      ).to.be.revertedWithCustomError(machineMandi, "DeadlineTooFar");
    });
  });

  describe("Job Refund", function () {
    it("should reject refund attempt before the deadline has passed", async function () {
      const { machineMandi, owner, buyer, nodeSigner, nodePayout, sampleServiceHash, samplePrice, sampleMinDelta } =
        await loadFixture(deployMachineMandiFixture);

      await machineMandi
        .connect(owner)
        .registerNode(nodeSigner.address, nodePayout.address, sampleServiceHash, samplePrice, sampleMinDelta);

      const deadline = BigInt(await time.latest()) + 3600n;
      await machineMandi.connect(buyer).createJob(1n, deadline, { value: samplePrice });

      // Attempt refund before deadline
      await expect(
        machineMandi.connect(buyer).refund(1n)
      ).to.be.revertedWithCustomError(machineMandi, "DeadlineNotPassed");
    });

    it("should allow refund after deadline, transfer funds back to buyer and set status to REFUNDED", async function () {
      const { machineMandi, owner, buyer, nodeSigner, nodePayout, sampleServiceHash, samplePrice, sampleMinDelta } =
        await loadFixture(deployMachineMandiFixture);

      await machineMandi
        .connect(owner)
        .registerNode(nodeSigner.address, nodePayout.address, sampleServiceHash, samplePrice, sampleMinDelta);

      const deadline = BigInt(await time.latest()) + 3600n;
      await machineMandi.connect(buyer).createJob(1n, deadline, { value: samplePrice });

      // Advance time past the deadline
      await time.increaseTo(deadline + 1n);

      // Call refund and check event and state
      await expect(machineMandi.connect(buyer).refund(1n))
        .to.emit(machineMandi, "JobRefunded")
        .withArgs(1n, 1n, buyer.address, samplePrice);

      const job = await machineMandi.getJob(1n);
      expect(job.status).to.equal(2); // REFUNDED = 2
    });

    it("should correctly transfer escrowed funds to buyer upon refund", async function () {
      const { machineMandi, owner, buyer, nodeSigner, nodePayout, sampleServiceHash, samplePrice, sampleMinDelta } =
        await loadFixture(deployMachineMandiFixture);

      await machineMandi
        .connect(owner)
        .registerNode(nodeSigner.address, nodePayout.address, sampleServiceHash, samplePrice, sampleMinDelta);

      const deadline = BigInt(await time.latest()) + 3600n;
      await machineMandi.connect(buyer).createJob(1n, deadline, { value: samplePrice });

      await time.increaseTo(deadline + 1n);

      await expect(machineMandi.connect(buyer).refund(1n)).to.changeEtherBalances(
        [machineMandi, buyer],
        [-samplePrice, samplePrice]
      );
    });

    it("should reject double refund of an already refunded job", async function () {
      const { machineMandi, owner, buyer, nodeSigner, nodePayout, sampleServiceHash, samplePrice, sampleMinDelta } =
        await loadFixture(deployMachineMandiFixture);

      await machineMandi
        .connect(owner)
        .registerNode(nodeSigner.address, nodePayout.address, sampleServiceHash, samplePrice, sampleMinDelta);

      const deadline = BigInt(await time.latest()) + 3600n;
      await machineMandi.connect(buyer).createJob(1n, deadline, { value: samplePrice });

      // Advance time past the deadline
      await time.increaseTo(deadline + 1n);

      // First refund succeeds
      await machineMandi.connect(buyer).refund(1n);

      // Second refund attempt must revert
      await expect(
        machineMandi.connect(buyer).refund(1n)
      ).to.be.revertedWithCustomError(machineMandi, "JobAlreadyRefunded");
    });

    it("should reject refund for non-existent job", async function () {
      const { machineMandi, buyer } = await loadFixture(deployMachineMandiFixture);

      await expect(machineMandi.connect(buyer).refund(999n)).to.be.revertedWithCustomError(
        machineMandi,
        "JobNotFound"
      );
    });
  });
});
