import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import hre from 'hardhat';
import type { Hex } from 'viem';
import { deploySuite, parseDeploymentProgress } from './deploy-suite.js';

const connection = await hre.network.create();
const publicClient = await connection.viem.getPublicClient();
const chainId = await publicClient.getChainId();
if (![31337, 11155111].includes(chainId)) throw new Error('Deployment is restricted to Hardhat local and Sepolia.');
const isSepolia = chainId === 11155111;
const journal = new URL(`../deployments/${isSepolia ? 'sepolia' : 'local'}.json`, import.meta.url);
const [tokenArtifact, coreArtifact] = await Promise.all([
  hre.artifacts.readArtifact('TinanAiToken'),
  hre.artifacts.readArtifact('TinanAiCore'),
]);
let close = async () => {};
try {
  // Do not reuse a journal across fresh, ephemeral local chains.
  const previous = isSepolia && existsSync(journal)
    ? parseDeploymentProgress(JSON.parse(readFileSync(journal, 'utf8')))
    : undefined;
  let walletClient;
  if (isSepolia) {
    const { connectSepoliaWallet } = await import('./wallet-connect.js');
    const connected = await connectSepoliaWallet(process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com');
    close = connected.close;
    walletClient = connected.wallet;
    console.log(`Sepolia account: ${connected.address}`);
    console.log('This deploys 100,000,000 TINAN to your wallet, then an owner-managed Core linked to that token.');
    console.log('You must review each deployment in your wallet. No private key is requested or stored.');
    const terminal = createInterface({ input: stdin, output: stdout });
    try {
      const approval = await terminal.question('Type DEPLOY SEPOLIA to continue (anything else cancels): ');
      if (approval !== 'DEPLOY SEPOLIA') throw new Error('Cancelled before deployment.');
    } finally {
      terminal.close();
    }
  } else {
    [walletClient] = await connection.viem.getWalletClients();
  }
  if (!walletClient) throw new Error('No deployer wallet available.');
  const result = await deploySuite({
    publicClient, walletClient, previous,
    tokenBytecode: tokenArtifact.bytecode as Hex,
    coreBytecode: coreArtifact.bytecode as Hex,
    record: (progress) => {
      // Atomic public-data journal; contains addresses and hashes, never session keys.
      const temporary = new URL(`${journal.href}.tmp`);
      writeFileSync(temporary, `${JSON.stringify(progress, null, 2)}\n`, { mode: 0o600 });
      renameSync(temporary, journal);
      if (progress.tokenDeploymentTxHash) console.log(`Token transaction: ${progress.tokenDeploymentTxHash}`);
      if (progress.coreDeploymentTxHash) console.log(`Core transaction: ${progress.coreDeploymentTxHash}`);
    },
  });
  console.log(`Token: ${result.tokenAddress}\nCore: ${result.coreAddress}`);
  console.log(`Confirmed deployment manifest: ${journal.pathname}`);
  if (isSepolia) {
    console.log(`Token explorer: https://sepolia.etherscan.io/address/${result.tokenAddress}`);
    console.log(`Core explorer: https://sepolia.etherscan.io/address/${result.coreAddress}`);
  } else {
    console.log('LOCAL SIMULATION ONLY: these addresses are not Sepolia deployments.');
  }
} catch (error) {
  // Avoid logging complete provider error objects, which can contain pairing/session data.
  const message = error instanceof Error ? error.message : 'Deployment failed.';
  console.error(message.replace(/wc:[^\s]+/g, '[private pairing URI]'));
  console.error('Any submitted hashes remain in the deployment journal. Inspect them before retrying.');
  process.exitCode = 1;
} finally {
  await close();
  await connection.close();
}
