import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import hre from 'hardhat';
import { decodeEventLog, getAddress, sha256, stringToHex, zeroAddress, zeroHash, type Hex } from 'viem';
import { tinanAiTokenAbi, tinanAiCoreAbi, TINANAI_INITIAL_SUPPLY, getTinanAiContracts } from '../src/index.js';
import { deploySuite, parseDeploymentProgress, type DeploymentProgress } from '../scripts/deploy-suite.js';

const connection = await hre.network.create({ network: 'hardhatLocal' });
const { viem } = connection;
const publicClient = await viem.getPublicClient();
const [owner, other] = await viem.getWalletClients();
const hash = sha256(stringToHex('TINANAI test document'));

async function fixture() {
  const token = await viem.deployContract('TinanAiToken', [owner.account.address]);
  const core = await viem.deployContract('TinanAiCore', [token.address, owner.account.address]);
  return { token, core };
}

describe('TinanAi suite', () => {
  it('mints exactly 100M TINAN with 18 decimals and no mint/burn administration', async () => {
    const { token } = await fixture();
    assert.equal(await token.read.name(), 'TinanAi');
    assert.equal(await token.read.symbol(), 'TINAN');
    assert.equal(await token.read.decimals(), 18);
    assert.equal(await token.read.totalSupply(), TINANAI_INITIAL_SUPPLY);
    assert.equal(await token.read.balanceOf([owner.account.address]), TINANAI_INITIAL_SUPPLY);
    const functions = tinanAiTokenAbi.filter((item) => item.type === 'function').map((item) => item.name);
    assert.equal(functions.some((name: string) => ['mint', 'burn', 'pause', 'upgradeTo'].includes(name)), false);
    const tx = await token.write.transfer([other.account.address, 123n]);
    await publicClient.waitForTransactionReceipt({ hash: tx });
    assert.equal(await token.read.balanceOf([other.account.address]), 123n);
    assert.equal(await token.read.totalSupply(), TINANAI_INITIAL_SUPPLY);
  });

  it('rejects zero initial holder and invalid Core token/owner addresses', async () => {
    await assert.rejects(viem.deployContract('TinanAiToken', [zeroAddress]), /ERC20InvalidReceiver/);
    const token = await viem.deployContract('TinanAiToken', [owner.account.address]);
    await assert.rejects(viem.deployContract('TinanAiCore', [zeroAddress, owner.account.address]), /InvalidToken/);
    await assert.rejects(viem.deployContract('TinanAiCore', [other.account.address, owner.account.address]), /InvalidToken/);
    await assert.rejects(viem.deployContract('TinanAiCore', [token.address, zeroAddress]), /OwnableInvalidOwner/);
  });

  it('links Core to Token and registers a readable proof with an event', async () => {
    const { token, core } = await fixture();
    assert.equal(getAddress(await core.read.token()), getAddress(token.address));
    assert.equal(getAddress(await core.read.owner()), getAddress(owner.account.address));
    const tx = await core.write.registerProof([hash, 'ipfs://public-reference', 'Example']);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
    assert.equal(receipt.status, 'success');
    const proof = await core.read.getProof([1n]);
    assert.equal(proof.contentHash, hash);
    assert.equal(proof.uri, 'ipfs://public-reference');
    assert.equal(proof.label, 'Example');
    assert.equal(getAddress(proof.submitter), getAddress(owner.account.address));
    assert.ok(proof.timestamp > 0n);
    assert.equal(await core.read.proofCount(), 1n);
    assert.equal(await core.read.proofIdByHash([hash]), 1n);
    const event = decodeEventLog({ abi: tinanAiCoreAbi, eventName: 'ProofRegistered', ...receipt.logs[0] });
    assert.equal(event.args.proofId, 1n);
    assert.equal(event.args.contentHash, hash);
  });

  it('rejects non-owner writes while allowing public proof reads', async () => {
    const { core } = await fixture();
    await assert.rejects(publicClient.simulateContract({
      address: core.address, abi: tinanAiCoreAbi, functionName: 'registerProof',
      args: [hash, '', ''], account: other.account.address,
    }), /OwnableUnauthorizedAccount/);
    await core.write.registerProof([hash, '', '']);
    const proof = await publicClient.readContract({
      address: core.address, abi: tinanAiCoreAbi, functionName: 'getProof',
      args: [1n], account: other.account.address,
    });
    assert.equal(proof.contentHash, hash);
  });

  it('rejects empty/duplicate hashes and nonexistent proof IDs', async () => {
    const { core } = await fixture();
    await assert.rejects(core.write.registerProof([zeroHash, '', '']), /EmptyHash/);
    await core.write.registerProof([hash, '', '']);
    await assert.rejects(core.write.registerProof([hash, '', '']), /DuplicateProof/);
    await assert.rejects(core.read.getProof([0n]), /InvalidProofId/);
    await assert.rejects(core.read.getProof([2n]), /InvalidProofId/);
    assert.equal(await core.read.proofCount(), 1n);
  });

  it('bounds public metadata by bytes, not JavaScript character count', async () => {
    const { core } = await fixture();
    await assert.rejects(core.write.registerProof([hash, 'x'.repeat(513), '']), /MetadataTooLong/);
    await assert.rejects(core.write.registerProof([hash, '', 'é'.repeat(65)]), /MetadataTooLong/);
    await core.write.registerProof([hash, 'x'.repeat(512), 'é'.repeat(64)]);
    assert.equal(await core.read.proofCount(), 1n);
  });

  it('moves registration authority when Ownable ownership is transferred', async () => {
    const { core } = await fixture();
    await core.write.transferOwnership([other.account.address]);
    await assert.rejects(core.write.registerProof([hash, '', '']), /OwnableUnauthorizedAccount/);
    const tx = await other.writeContract({
      address: core.address, abi: tinanAiCoreAbi, functionName: 'registerProof', args: [hash, '', ''],
    });
    await publicClient.waitForTransactionReceipt({ hash: tx });
    assert.equal(getAddress((await core.read.getProof([1n])).submitter), getAddress(other.account.address));
  });
});

describe('Deployment and future frontend integration', () => {
  it('deploys Token before Core and resumes after a rejected Core request without minting a second token', async () => {
    const tokenArtifact = await hre.artifacts.readArtifact('TinanAiToken');
    const coreArtifact = await hre.artifacts.readArtifact('TinanAiCore');
    const records: DeploymentProgress[] = [];
    let calls = 0;
    const rejectingWallet = new Proxy(owner, {
      get(target, property) {
        if (property === 'deployContract') return (...args: unknown[]) => {
          if (++calls === 2) throw new Error('Simulated wallet rejection of Core');
          return Reflect.apply(target.deployContract, target, args);
        };
        return Reflect.get(target, property);
      },
    });
    const common = {
      publicClient, tokenBytecode: tokenArtifact.bytecode as Hex, coreBytecode: coreArtifact.bytecode as Hex,
      record: (state: DeploymentProgress) => records.push({ ...state }),
    };
    await assert.rejects(deploySuite({ ...common, walletClient: rejectingWallet }), /Simulated wallet rejection/);
    const partial = records.at(-1)!;
    assert.ok(partial.tokenAddress && partial.tokenDeploymentTxHash);
    assert.equal(partial.coreDeploymentTxHash, undefined);
    const result = await deploySuite({ ...common, walletClient: owner, previous: partial });
    assert.equal(result.status, 'confirmed');
    assert.equal(result.tokenAddress, partial.tokenAddress);
    assert.equal(result.tokenDeploymentTxHash, partial.tokenDeploymentTxHash);
    assert.ok(result.coreAddress && result.coreDeploymentTxHash);
    assert.ok(records.find((state) => state.coreDeploymentTxHash)?.tokenAddress);
    const resumed = await deploySuite({ ...common, walletClient: owner, previous: result });
    assert.equal(resumed.coreAddress, result.coreAddress);
    assert.equal(resumed.coreDeploymentTxHash, result.coreDeploymentTxHash);
  });

  it('rejects corrupt journals and missing/unconfirmed frontend deployment addresses', () => {
    assert.throws(() => parseDeploymentProgress({ schemaVersion: 1, chainId: 1 }), /Invalid/);
    assert.throws(() => getTinanAiContracts({
      status: 'confirmed', chainId: 11155111, deployer: owner.account.address,
      tokenAddress: zeroAddress, coreAddress: other.account.address,
      tokenDeploymentTxHash: zeroHash, coreDeploymentTxHash: zeroHash,
    }), /Invalid deployed/);
    assert.equal(tinanAiCoreAbi.some((item) => item.type === 'function' && item.name === 'registerProof'), true);
  });
});
