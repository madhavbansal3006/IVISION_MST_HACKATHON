import { ethers } from "hardhat";
import assert from "node:assert";

describe("EcrecoverProbe", function () {
  it("should deploy probe and verify valid signature matching ephemeral wallet", async function () {
    const Factory = await ethers.getContractFactory("EcrecoverProbe");
    const probe = await Factory.deploy();
    await probe.waitForDeployment();

    const tempWallet = ethers.Wallet.createRandom();
    const message = "MachineMandi:MST-Testnet:EcrecoverProbe:DeviceVerification";
    const digest = ethers.keccak256(ethers.toUtf8Bytes(message));

    // Sign raw digest directly with secp256k1
    const signature = tempWallet.signingKey.sign(digest);

    // Call verifySignature via staticCall
    const [isMatch, recovered] = await probe.verifySignature.staticCall(
      tempWallet.address,
      digest,
      signature.v,
      signature.r,
      signature.s
    );

    assert.strictEqual(isMatch, true);
    assert.strictEqual(recovered.toLowerCase(), tempWallet.address.toLowerCase());

    // Execute tx and check event
    const tx = await probe.verifySignature(
      tempWallet.address,
      digest,
      signature.v,
      signature.r,
      signature.s
    );
    const receipt = await tx.wait();
    assert.ok(receipt);

    const event = receipt?.logs.map((log) => {
      try {
        return probe.interface.parseLog(log);
      } catch {
        return null;
      }
    }).find((e) => e?.name === "SignatureVerified");

    assert.ok(event, "SignatureVerified event should exist");
    assert.strictEqual((event.args[0] as string).toLowerCase(), tempWallet.address.toLowerCase());
    assert.strictEqual((event.args[1] as string).toLowerCase(), tempWallet.address.toLowerCase());
  });

  it("should return false if expectedSigner does not match recovered address", async function () {
    const Factory = await ethers.getContractFactory("EcrecoverProbe");
    const probe = await Factory.deploy();
    await probe.waitForDeployment();

    const tempWallet = ethers.Wallet.createRandom();
    const otherWallet = ethers.Wallet.createRandom();
    const message = "MachineMandi:MST-Testnet:EcrecoverProbe:DeviceVerification";
    const digest = ethers.keccak256(ethers.toUtf8Bytes(message));

    const signature = tempWallet.signingKey.sign(digest);

    const [isMatch, recovered] = await probe.verifySignature.staticCall(
      otherWallet.address,
      digest,
      signature.v,
      signature.r,
      signature.s
    );

    assert.strictEqual(isMatch, false);
    assert.strictEqual(recovered.toLowerCase(), tempWallet.address.toLowerCase());
  });

  it("should revert if v is not 27 or 28", async function () {
    const Factory = await ethers.getContractFactory("EcrecoverProbe");
    const probe = await Factory.deploy();
    await probe.waitForDeployment();

    const tempWallet = ethers.Wallet.createRandom();
    const digest = ethers.keccak256(ethers.toUtf8Bytes("test"));
    const signature = tempWallet.signingKey.sign(digest);

    let reverted = false;
    try {
      await probe.verifySignature.staticCall(
        tempWallet.address,
        digest,
        26, // invalid v
        signature.r,
        signature.s
      );
    } catch (err: unknown) {
      reverted = true;
      assert.match((err as Error).message, /Invalid v parameter/);
    }
    assert.strictEqual(reverted, true, "Should have reverted on invalid v");
  });
});
