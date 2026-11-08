import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const require = createRequire(import.meta.url);
const sourcePath = join(root, 'contracts', 'TinanToken.sol');
const source = readFileSync(sourcePath, 'utf8');
const dependencySources = {};

const input = {
  language: 'Solidity',
  sources: { 'TinanToken.sol': { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      '*': { '*': ['abi', 'evm.bytecode.object', 'metadata'] },
    },
  },
};

function findImports(importPath) {
  try {
    const resolved = require.resolve(importPath, { paths: [root] });
    const contents = readFileSync(resolved, 'utf8');
    dependencySources[importPath] = { content: contents };
    return { contents };
  } catch (error) {
    return { error: `Unable to resolve ${importPath}: ${String(error)}` };
  }
}

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
const errors = (output.errors ?? []).filter((entry) => entry.severity === 'error');
if (errors.length > 0) {
  throw new Error(errors.map((entry) => entry.formattedMessage).join('\n'));
}

const contract = output.contracts['TinanToken.sol'].TinanToken;
const artifact = {
  contractName: 'TinanToken',
  compilerVersion: solc.version(),
  sourceName: 'contracts/TinanToken.sol',
  abi: contract.abi,
  bytecode: `0x${contract.evm.bytecode.object}`,
};

mkdirSync(join(root, 'src', 'generated'), { recursive: true });
writeFileSync(
  join(root, 'src', 'generated', 'tinan-token.json'),
  `${JSON.stringify(artifact, null, 2)}\n`,
);
const metadata = JSON.parse(contract.metadata);
writeFileSync(
  join(root, 'src', 'generated', 'tinan-token-build.json'),
  `${JSON.stringify({
    compilerVersion: solc.version(),
    evmVersion: metadata.settings.evmVersion,
    optimizer: input.settings.optimizer,
    dependencies: { openzeppelinContracts: require('@openzeppelin/contracts/package.json').version },
    licenses: { openzeppelin: readFileSync(join(root, 'contracts', 'OpenZeppelin-LICENSE.txt'), 'utf8') },
    standardInput: { ...input, sources: { ...input.sources, ...dependencySources } },
  }, null, 2)}\n`,
);
console.log(`Compiled ${artifact.contractName} with ${artifact.compilerVersion}`);
