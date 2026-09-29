import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

dotenv.config();

async function main() {
  const file = path.resolve(process.cwd(), "deployments", "mst-testnet.json");
  if (!fs.existsSync(file)) throw new Error("Deploy MSTTest first.");

  const deployment = JSON.parse(fs.readFileSync(file, "utf8"));
  const address = deployment.mstTest?.contractAddress;
  if (!address || !ethers.isAddress(address)) throw new Error("Invalid MSTTest address.");

  const code = await ethers.provider.getCode(address);
  if (code === "0x") throw new Error(`No contract code at ${address}.`);

  const [sender] = await ethers.getSigners();
  const contract = await ethers.getContractAt("MSTTest", address);
  const value = ethers.parseUnits("0.000001", "ether");

  console.log(`Calling ping() from ${sender.address}`);
  const tx = await contract.ping({ value });
  const receipt = await tx.wait();

  if (!receipt || receipt.status !== 1) throw new Error("ping() failed.");

  const event = receipt.logs.map((log) => {
    try { return contract.interface.parseLog(log); } catch { return null; }
  }).find((x) => x?.name === "Ping");

  if (!event) throw new Error("Ping event not found.");
  if ((event.args[0] as string).toLowerCase() !== sender.address.toLowerCase()) {
    throw new Error("Ping sender mismatch.");
  }
  if ((event.args[1] as bigint) !== value) throw new Error("Ping value mismatch.");

  const explorer = deployment.mstTest?.explorer;
  console.log("=== MST PING RESULT ===");
  console.log("Transaction: PASS");
  console.log(`TX Hash: ${tx.hash}`);
  console.log(`Block: ${receipt.blockNumber}`);
  console.log(`Explorer: ${explorer ? explorer.replace(/\/$/, "") + "/tx/" + tx.hash : "TODO — VERIFY WITH MST"}`);
}

main().catch((error) => {
  console.error("PING RESULT: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
