import { existsSync, openSync, closeSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { getAddress, keccak256, parseAbiParameters, encodeAbiParameters, formatEther, type Hex, type PublicClient } from 'viem';
import hre from 'hardhat';
import {
  acquireMainnetDeploymentLock,
  assertAuthorizedDeployer,
  assertMainnetChainId,
  assertNoRecordedMainnetDeployment,
  buildTokenOnlyCreationData,
  estimateMainnetDeployment,
  formatMainnetMaximumCost,
  MAINNET_DEPLOYMENT_CONFIRMATIONS,
  MAINNET_TOKEN_SUPPLY,
  requestTokenOnlyDeployment,
  requireHttpsMainnetRpc,
  verifyExistingMainnetToken,
} from './mainnet-safety.js';
import { connectMainnetWallet } from './wallet-connect-mainnet.js';
import { assertSavedMainnetApproval } from './admin-mainnet-approval.js';
import {
  HISTORICAL_TINAN_ADDRESSES, NEW_MAINNET_DECLARATION, NEW_MAINNET_TARGET_ID,
  assertNewMainnetIdentity, assertCreationSimulationAuthorized, isHistoricalTinanAddress,
} from '../src/mainnet-identity.js';

const deploymentsDir = new URL('../deployments/', import.meta.url).pathname;
const manifestPath = new URL('../deployments/mainnet.json', import.meta.url).pathname;
const lockPath = new URL('../deployments/mainnet.lock', import.meta.url).pathname;
const verificationAddress = process.env.TINANAI_MAINNET_VERIFY_ADDRESS?.trim();
const configuredKnownAddress = process.env.TINANAI_MAINNET_KNOWN_TOKEN_ADDRESS?.trim();

async function verifyKnownAddress(address: string, publicClient: PublicClient, runtimeBytecode: Hex) {
  const result = await verifyExistingMainnetToken(publicClient, address, runtimeBytecode);
  console.log('Existing Mainnet token checks passed (no transaction was sent):');
  console.log(`Network: Ethereum Mainnet (chain ID ${result.chainId})`);
  console.log(`Token address: ${result.address}`);
  console.log(`Verified at block: ${result.blockNumber}`);
  console.log(`Runtime bytecode hash: ${result.runtimeBytecodeHash}`);
  console.log('Name/symbol/decimals/total supply: TinanAi / TINAN / 18 / 100,000,000 (verified)');
  console.log(`Etherscan code page: https://etherscan.io/address/${result.address}#code`);
  console.log('This does not verify Etherscan source or prove the address is the only TINAN deployment.');
}

async function promptFor(text: string) {
  if (!stdin.isTTY) throw new Error('An interactive terminal is required for Mainnet deployment. No transaction was submitted.');
  const terminal = createInterface({ input: stdin, output: stdout });
  try { return await terminal.question(text); }
  finally { terminal.close(); }
}

function writeManifest(record: Record<string, unknown>) {
  const temporary = `${manifestPath}.tmp`;
  const fd = openSync(temporary, 'wx', 0o600);
  try {
    writeFileSync(fd, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    closeSync(fd);
    renameSync(temporary, manifestPath);
  } catch (error) {
    try { closeSync(fd); } catch { /* already closed */ }
    try { unlinkSync(temporary); } catch { /* no partial journal to retain */ }
    throw error;
  }
}

const endpoint = requireHttpsMainnetRpc(process.env.TINANAI_MAINNET_RPC_URL);
if (verificationAddress && configuredKnownAddress) {
  throw new Error('Provide only one existing-token verification address.');
}
if (!verificationAddress && !configuredKnownAddress && existsSync(manifestPath)) {
  throw new Error('A Mainnet manifest already exists. Run the explicit verify:mainnet command; never redeploy over it.');
}

const connection = await hre.network.create({ network: 'mainnet' });
let closeWallet = async () => {};
let releaseLock: (() => void) | undefined;
try {
  const publicClient = await connection.viem.getPublicClient();
  assertMainnetChainId(await publicClient.getChainId());
  const tokenArtifact = await hre.artifacts.readArtifact('TinanAiToken');
  const artifact = {
    abi: tokenArtifact.abi,
    bytecode: tokenArtifact.bytecode as Hex,
    deployedBytecode: tokenArtifact.deployedBytecode as Hex,
  };
  const sourceSha256 = createHash('sha256').update(readFileSync(new URL('../contracts/TinanAiToken.sol', import.meta.url))).digest('hex');
  assertNewMainnetIdentity(sourceSha256, keccak256(artifact.bytecode), keccak256(artifact.deployedBytecode));
  console.log('Historical TINAN contracts exist and are NOT this new deployment identity:');
  for (const address of HISTORICAL_TINAN_ADDRESSES) console.log(address);

  const knownAddress = verificationAddress ?? configuredKnownAddress;
  if (isHistoricalTinanAddress(knownAddress)) throw new Error('Historical TINAN is not the NEW TinanAiToken identity. No historical contract will be adopted or changed.');

  if (knownAddress) {
    await verifyKnownAddress(knownAddress, publicClient, artifact.deployedBytecode);
  } else {
    // Must precede wallet pairing, locks and simulation. No permission by default.
    assertCreationSimulationAuthorized(process.env.TINANAI_MAINNET_SIMULATION_AUTHORIZATION);
    await assertSavedMainnetApproval(process.env.TINANAI_MAINNET_AUTHORIZED_DEPLOYER);
    if (!process.env.VITE_REOWN_PROJECT_ID?.trim()) {
      throw new Error('Set the public VITE_REOWN_PROJECT_ID before using the Mainnet deployment flow.');
    }
    assertNoRecordedMainnetDeployment(deploymentsDir);
    const lockRelease = acquireMainnetDeploymentLock(lockPath);
    releaseLock = lockRelease;
    assertNoRecordedMainnetDeployment(deploymentsDir);

    const connected = await connectMainnetWallet(endpoint);
    closeWallet = connected.close;
    const deployer = assertAuthorizedDeployer(connected.address, process.env.TINANAI_MAINNET_AUTHORIZED_DEPLOYER);
    assertMainnetChainId(await connected.wallet.getChainId());
    assertMainnetChainId(await publicClient.getChainId());
    const creationData = buildTokenOnlyCreationData(artifact, deployer);
    const gas = await estimateMainnetDeployment(publicClient, deployer, creationData, process.env.TINANAI_MAINNET_SIMULATION_AUTHORIZATION);
    const creationBytecodeHash = keccak256(artifact.bytecode);
    const expectedRuntimeBytecodeHash = keccak256(artifact.deployedBytecode);
    const constructorArgs = encodeAbiParameters(parseAbiParameters('address initialHolder'), [deployer]);

    console.log('\nMAINNET TOKEN-ONLY DEPLOYMENT REVIEW');
    console.log('Network: Ethereum Mainnet');
    console.log('Chain ID: 1');
    console.log('Contract: existing TinanAiToken.sol; no new token source');
    console.log('Token name/symbol: TinanAi / TINAN');
    console.log('Total supply/decimals: 100,000,000 / 18');
    console.log(`Initial holder and deployer: ${deployer}`);
    console.log('Deployed contracts: TinanAiToken only. TinanAiCore will not be deployed.');
    console.log(`Creation bytecode hash: ${creationBytecodeHash}`);
    console.log(`Expected runtime bytecode hash: ${expectedRuntimeBytecodeHash}`);
    console.log(`Reviewed source SHA-256: ${sourceSha256}`);
    console.log('Independent bytecode and Etherscan source verification: pending deployment.');
    console.log(`Constructor ABI arguments: ${constructorArgs}`);
    console.log(`Estimated gas: ${gas.estimateGas.toString()} (20% limit margin; ${gas.gasLimit.toString()} limit)`);
    console.log(`Maximum network fee at the submitted EIP-1559 cap: ${formatMainnetMaximumCost(gas.maximumCostWei)}`);
    console.log(`Current deployer ETH balance: ${formatEther(gas.balanceWei)} ETH`);
    console.log('Transaction value: 0 ETH. No payment checkout settings will be changed.');
    console.log('A matching contract code hash and expected ERC-20 metadata will be verified after 12 Mainnet confirmations.');
    console.log('Important: a missing local manifest cannot prove no other Mainnet deployment exists.');

    const deploymentDeclaration = NEW_MAINNET_DECLARATION;
    if (await promptFor(`Historical TINAN contracts exist and will remain unchanged. Review records for this NEW target identity; this is NOT a claim that no TINAN contracts exist. Type exactly:\n${deploymentDeclaration}\n> `) !== deploymentDeclaration) {
      throw new Error('Existing-deployment check was not confirmed. No transaction was submitted.');
    }
    const transactionApproval = 'DEPLOY TINAN TOKEN TO ETHEREUM MAINNET';
    if (await promptFor(`Confirm the details above. Type exactly:\n${transactionApproval}\n> `) !== transactionApproval) {
      throw new Error('Mainnet deployment cancelled before the wallet request.');
    }

    assertNoRecordedMainnetDeployment(deploymentsDir);
    assertMainnetChainId(await publicClient.getChainId());
    assertMainnetChainId(await connected.wallet.getChainId());
    const authorizedDeployer = assertAuthorizedDeployer(connected.wallet.account?.address, process.env.TINANAI_MAINNET_AUTHORIZED_DEPLOYER);
    if (authorizedDeployer !== deployer) throw new Error('The authorized wallet changed. No transaction was submitted.');
    const currentBalance = await publicClient.getBalance({ address: deployer });
    if (currentBalance < gas.maximumCostWei) throw new Error('ETH balance fell below the displayed maximum gas cost. No transaction was submitted.');
    await assertSavedMainnetApproval(process.env.TINANAI_MAINNET_AUTHORIZED_DEPLOYER);

    const preparedAt = new Date().toISOString();
    const preparedJournal: Record<string, unknown> = {
      schemaVersion: 1,
      targetId: NEW_MAINNET_TARGET_ID,
      sourceSha256,
      historicalContractsPreserved: [...HISTORICAL_TINAN_ADDRESSES],
      network: 'Ethereum Mainnet',
      chainId: 1,
      status: 'prepared',
      tokenName: 'TinanAi',
      tokenSymbol: 'TINAN',
      decimals: 18,
      totalSupply: MAINNET_TOKEN_SUPPLY.toString(),
      initialHolder: deployer,
      deployer,
      deploymentTxHash: null,
      contractAddress: null,
      creationBytecodeHash,
      expectedRuntimeBytecodeHash,
      constructorArgs,
      estimatedGas: gas.estimateGas.toString(),
      gasLimit: gas.gasLimit.toString(),
      maxFeePerGas: gas.maxFeePerGas.toString(),
      estimatedMaximumCostWei: gas.maximumCostWei.toString(),
      requiredConfirmations: MAINNET_DEPLOYMENT_CONFIRMATIONS,
      compilerVersion: '0.8.38',
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'cancun',
      license: 'MIT',
      sourceVerification: 'pending-manual-Etherscan',
      paymentCheckout: 'disabled-until-separate-admin-configuration-and-live-wallet-test',
      preparedAt,
    };
    // Journal the intended transaction before opening the wallet approval
    // request, so an interrupted submit cannot silently allow a second token.
    writeManifest(preparedJournal);

    let transactionHash: Hex;
    try {
      transactionHash = await requestTokenOnlyDeployment(connected.wallet, artifact, deployer, gas);
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      if (code === 4001 || code === '4001') {
        writeManifest({ ...preparedJournal, status: 'wallet-rejected-before-broadcast' });
        throw new Error('The wallet rejected the Mainnet transaction. No hash was returned. The prepared journal was retained; review it and wallet activity before any retry.');
      }
      writeManifest({ ...preparedJournal, status: 'submission-uncertain' });
      throw new Error('The wallet did not return a deployment transaction hash. The journal marks the submission as uncertain; inspect wallet activity before any retry.');
    }

    console.log(`Deployment transaction hash returned: ${transactionHash}`);
    const submittedAt = new Date().toISOString();
    const journal: Record<string, unknown> = {
      ...preparedJournal,
      status: 'submitted',
      deploymentTxHash: transactionHash,
      submittedAt,
    };
    writeManifest(journal);
    console.log(`Deployment transaction submitted: ${transactionHash}`);
    console.log('The transaction is journaled. Do not retry or remove the journal while its status is uncertain.');

    let receipt;
    try {
      receipt = await publicClient.waitForTransactionReceipt({
        hash: transactionHash,
        confirmations: MAINNET_DEPLOYMENT_CONFIRMATIONS,
        timeout: 1_200_000,
      });
    } catch {
      throw new Error(`Confirmation is still pending or RPC is unavailable. Preserve ${manifestPath} and inspect the wallet and Etherscan before any retry.`);
    }
    if (receipt.status !== 'success' || !receipt.contractAddress) {
      writeManifest({ ...journal, status: 'reverted', receiptBlockNumber: receipt.blockNumber.toString() });
      throw new Error('Mainnet deployment reverted. The failed transaction hash is preserved; no retry will be attempted.');
    }
    const address = getAddress(receipt.contractAddress);
    const verification = await verifyExistingMainnetToken(publicClient, address, artifact.deployedBytecode);
    const finalJournal = {
      ...journal,
      status: 'confirmed',
      contractAddress: address,
      receiptBlockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPrice: receipt.effectiveGasPrice.toString(),
      actualGasSpentWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
      runtimeBytecodeHash: verification.runtimeBytecodeHash,
      runtimeBytecodeVerifiedAgainstArtifact: verification.runtimeBytecodeMatches,
      metadataVerifiedAtBlock: verification.blockNumber,
      confirmedAt: new Date().toISOString(),
    };
    writeManifest(finalJournal);
    console.log('\nMAINNET DEPLOYMENT CONFIRMED');
    console.log(`Contract address: ${address}`);
    console.log(`Transaction hash: ${transactionHash}`);
    console.log(`Deployer wallet: ${deployer}`);
    console.log('Network / Chain ID: Ethereum Mainnet / 1');
    console.log('On-chain name/symbol/decimals/supply: TinanAi / TINAN / 18 / 100,000,000');
    console.log(`Actual gas spent: ${formatEther(BigInt(finalJournal.actualGasSpentWei))} ETH`);
    console.log(`Etherscan: https://etherscan.io/address/${address}`);
    console.log(`Etherscan source code: https://etherscan.io/address/${address}#code (manual verification still pending)`);
    console.log(`Deployment journal: ${manifestPath}`);
    console.log('Payments remain disabled. Configure the verified address and treasury separately; run a separately approved live-wallet test before checkout.');
  }
} catch (error) {
  const message = error instanceof Error ? error.message : 'Mainnet deployment preparation failed.';
  console.error(message.replace(/wc:[^\s]+/g, '[private pairing URI]'));
  if (process.exitCode === undefined) process.exitCode = 1;
} finally {
  try { await closeWallet(); } catch { console.error('Wallet session cleanup failed. Close this local terminal session and wallet connection manually.'); }
  try { releaseLock?.(); } catch { console.error(`Mainnet lock cleanup failed; inspect ${lockPath} and transaction history before retrying.`); }
  await connection.close();
}
