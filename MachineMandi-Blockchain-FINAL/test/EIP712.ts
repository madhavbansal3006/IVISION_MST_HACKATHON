import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("MachineMandi - EIP-712 Device Proof Verification", function () {
  async function deployAndCreateJobFixture() {
    const [owner, buyer, nodeSigner, nodePayout, wrongSigner, relayer] = await ethers.getSigners();

    const MachineMandiFactory = await ethers.getContractFactory("MachineMandi");
    const machineMandi = await MachineMandiFactory.deploy();

    const sampleServiceHash = ethers.keccak256(ethers.toUtf8Bytes("3D-PRINTING-SERVICE-V1"));
    const samplePrice = ethers.parseEther("0.1");
    const sampleMinDelta = 100n;

    // Register Node 1
    await machineMandi
      .connect(owner)
      .registerNode(nodeSigner.address, nodePayout.address, sampleServiceHash, samplePrice, sampleMinDelta);

    const latestBlockTime = BigInt(await time.latest());
    const deadline = latestBlockTime + 7200n; // 2 hours in future

    // Create Job 1
    await machineMandi.connect(buyer).createJob(1n, deadline, { value: samplePrice });

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

    const validProofData = {
      jobId: 1n,
      nodeId: 1n,
      nonce: 1n,
      startedAt: latestBlockTime + 100n,
      completedAt: latestBlockTime + 500n,
      preReading: 1000n,
      postReading: 1250n, // delta = 250 >= 100
      serviceHash: sampleServiceHash,
    };

    return {
      machineMandi,
      owner,
      buyer,
      nodeSigner,
      nodePayout,
      wrongSigner,
      relayer,
      sampleServiceHash,
      samplePrice,
      sampleMinDelta,
      deadline,
      domain,
      types,
      validProofData,
    };
  }

  describe("Proof Verification & Settlement Lifecycle", function () {
    it("valid proof completes job", async function () {
      const { machineMandi, nodeSigner, nodePayout, buyer, domain, types, validProofData, samplePrice } =
        await loadFixture(deployAndCreateJobFixture);

      const signature = await nodeSigner.signTypedData(domain, types, validProofData);

      await expect(
        machineMandi.submitProof(
          validProofData.jobId,
          validProofData.nodeId,
          validProofData.nonce,
          validProofData.startedAt,
          validProofData.completedAt,
          validProofData.preReading,
          validProofData.postReading,
          validProofData.serviceHash,
          signature
        )
      )
        .to.emit(machineMandi, "JobCompleted")
        .withArgs(
          validProofData.jobId,
          validProofData.nodeId,
          buyer.address,
          nodePayout.address,
          samplePrice,
          validProofData.preReading,
          validProofData.postReading,
          nodeSigner.address
        );

      const job = await machineMandi.getJob(validProofData.jobId);
      expect(job.status).to.equal(1); // COMPLETED = 1
    });

    it("valid proof sends escrow to payout wallet", async function () {
      const { machineMandi, nodeSigner, nodePayout, domain, types, validProofData, samplePrice } =
        await loadFixture(deployAndCreateJobFixture);

      const signature = await nodeSigner.signTypedData(domain, types, validProofData);

      await expect(
        machineMandi.submitProof(
          validProofData.jobId,
          validProofData.nodeId,
          validProofData.nonce,
          validProofData.startedAt,
          validProofData.completedAt,
          validProofData.preReading,
          validProofData.postReading,
          validProofData.serviceHash,
          signature
        )
      ).to.changeEtherBalances([machineMandi, nodePayout], [-samplePrice, samplePrice]);
    });

    it("completed job records pre/post readings", async function () {
      const { machineMandi, nodeSigner, domain, types, validProofData } =
        await loadFixture(deployAndCreateJobFixture);

      const signature = await nodeSigner.signTypedData(domain, types, validProofData);

      await machineMandi.submitProof(
        validProofData.jobId,
        validProofData.nodeId,
        validProofData.nonce,
        validProofData.startedAt,
        validProofData.completedAt,
        validProofData.preReading,
        validProofData.postReading,
        validProofData.serviceHash,
        signature
      );

      const job = await machineMandi.getJob(validProofData.jobId);
      expect(job.preValue).to.equal(validProofData.preReading);
      expect(job.postValue).to.equal(validProofData.postReading);
    });

    it("wrong device signer reverts", async function () {
      const { machineMandi, wrongSigner, domain, types, validProofData } =
        await loadFixture(deployAndCreateJobFixture);

      const signature = await wrongSigner.signTypedData(domain, types, validProofData);

      await expect(
        machineMandi.submitProof(
          validProofData.jobId,
          validProofData.nodeId,
          validProofData.nonce,
          validProofData.startedAt,
          validProofData.completedAt,
          validProofData.preReading,
          validProofData.postReading,
          validProofData.serviceHash,
          signature
        )
      ).to.be.revertedWithCustomError(machineMandi, "InvalidSigner");
    });

    it("wrong jobId reverts", async function () {
      const { machineMandi, nodeSigner, domain, types, validProofData } =
        await loadFixture(deployAndCreateJobFixture);

      const nonExistentJobId = 999n;
      const proof = { ...validProofData, jobId: nonExistentJobId };
      const signature = await nodeSigner.signTypedData(domain, types, proof);

      await expect(
        machineMandi.submitProof(
          nonExistentJobId,
          proof.nodeId,
          proof.nonce,
          proof.startedAt,
          proof.completedAt,
          proof.preReading,
          proof.postReading,
          proof.serviceHash,
          signature
        )
      ).to.be.revertedWithCustomError(machineMandi, "JobNotFound");
    });

    it("wrong nodeId reverts", async function () {
      const { machineMandi, nodeSigner, domain, types, validProofData } =
        await loadFixture(deployAndCreateJobFixture);

      const wrongNodeId = 2n;
      const signature = await nodeSigner.signTypedData(domain, types, validProofData);

      await expect(
        machineMandi.submitProof(
          validProofData.jobId,
          wrongNodeId,
          validProofData.nonce,
          validProofData.startedAt,
          validProofData.completedAt,
          validProofData.preReading,
          validProofData.postReading,
          validProofData.serviceHash,
          signature
        )
      ).to.be.revertedWithCustomError(machineMandi, "InvalidNodeId");
    });

    it("wrong nonce reverts", async function () {
      const { machineMandi, nodeSigner, domain, types, validProofData } =
        await loadFixture(deployAndCreateJobFixture);

      const wrongNonce = 99n;
      const signature = await nodeSigner.signTypedData(domain, types, validProofData);

      await expect(
        machineMandi.submitProof(
          validProofData.jobId,
          validProofData.nodeId,
          wrongNonce,
          validProofData.startedAt,
          validProofData.completedAt,
          validProofData.preReading,
          validProofData.postReading,
          validProofData.serviceHash,
          signature
        )
      ).to.be.revertedWithCustomError(machineMandi, "InvalidNonce");
    });

    it("wrong serviceHash reverts", async function () {
      const { machineMandi, nodeSigner, domain, types, validProofData } =
        await loadFixture(deployAndCreateJobFixture);

      const wrongServiceHash = ethers.keccak256(ethers.toUtf8Bytes("WRONG-SERVICE-SPEC"));
      const signature = await nodeSigner.signTypedData(domain, types, validProofData);

      await expect(
        machineMandi.submitProof(
          validProofData.jobId,
          validProofData.nodeId,
          validProofData.nonce,
          validProofData.startedAt,
          validProofData.completedAt,
          validProofData.preReading,
          validProofData.postReading,
          wrongServiceHash,
          signature
        )
      ).to.be.revertedWithCustomError(machineMandi, "InvalidServiceHash");
    });

    it("postReading equal to preReading reverts", async function () {
      const { machineMandi, nodeSigner, domain, types, validProofData } =
        await loadFixture(deployAndCreateJobFixture);

      const invalidProof = {
        ...validProofData,
        preReading: 1000n,
        postReading: 1000n,
      };
      const signature = await nodeSigner.signTypedData(domain, types, invalidProof);

      await expect(
        machineMandi.submitProof(
          invalidProof.jobId,
          invalidProof.nodeId,
          invalidProof.nonce,
          invalidProof.startedAt,
          invalidProof.completedAt,
          invalidProof.preReading,
          invalidProof.postReading,
          invalidProof.serviceHash,
          signature
        )
      ).to.be.revertedWithCustomError(machineMandi, "InvalidReadings");
    });

    it("insufficient delta reverts", async function () {
      const { machineMandi, nodeSigner, domain, types, validProofData, sampleMinDelta } =
        await loadFixture(deployAndCreateJobFixture);

      // sampleMinDelta is 100n, delta here is 99n (< 100n)
      const invalidProof = {
        ...validProofData,
        preReading: 1000n,
        postReading: 1000n + (sampleMinDelta - 1n),
      };
      const signature = await nodeSigner.signTypedData(domain, types, invalidProof);

      await expect(
        machineMandi.submitProof(
          invalidProof.jobId,
          invalidProof.nodeId,
          invalidProof.nonce,
          invalidProof.startedAt,
          invalidProof.completedAt,
          invalidProof.preReading,
          invalidProof.postReading,
          invalidProof.serviceHash,
          signature
        )
      ).to.be.revertedWithCustomError(machineMandi, "InsufficientDelta");
    });

    it("completedAt before startedAt reverts", async function () {
      const { machineMandi, nodeSigner, domain, types, validProofData } =
        await loadFixture(deployAndCreateJobFixture);

      const invalidProof = {
        ...validProofData,
        startedAt: 2000n,
        completedAt: 1999n,
      };
      const signature = await nodeSigner.signTypedData(domain, types, invalidProof);

      await expect(
        machineMandi.submitProof(
          invalidProof.jobId,
          invalidProof.nodeId,
          invalidProof.nonce,
          invalidProof.startedAt,
          invalidProof.completedAt,
          invalidProof.preReading,
          invalidProof.postReading,
          invalidProof.serviceHash,
          signature
        )
      ).to.be.revertedWithCustomError(machineMandi, "InvalidTimestamps");
    });

    it("proof after deadline reverts", async function () {
      const { machineMandi, nodeSigner, domain, types, validProofData, deadline } =
        await loadFixture(deployAndCreateJobFixture);

      const signature = await nodeSigner.signTypedData(domain, types, validProofData);

      // Advance block time past job deadline
      await time.increaseTo(deadline + 1n);

      await expect(
        machineMandi.submitProof(
          validProofData.jobId,
          validProofData.nodeId,
          validProofData.nonce,
          validProofData.startedAt,
          validProofData.completedAt,
          validProofData.preReading,
          validProofData.postReading,
          validProofData.serviceHash,
          signature
        )
      ).to.be.revertedWithCustomError(machineMandi, "DeadlineExpired");
    });
  });
});
