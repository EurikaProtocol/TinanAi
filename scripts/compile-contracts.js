// Compiles contracts/*.sol with solc and writes ABIs/bytecode to contracts/artifacts (gitignored).
const fs = require('fs');
const path = require('path');
const solc = require('solc');

const dir = path.join(__dirname, '..', 'contracts');
const sources = {};
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sol'))) {
  sources[f] = { content: fs.readFileSync(path.join(dir, f), 'utf8') };
}
function findImports(p) {
  const full = path.join(__dirname, '..', 'node_modules', p);
  return fs.existsSync(full) ? { contents: fs.readFileSync(full, 'utf8') } : { error: 'not found: ' + p };
}
const out = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: 'Solidity',
      sources,
      settings: {
        optimizer: { enabled: true, runs: 200 },
        outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
      },
    }),
    { import: findImports }
  )
);
let failed = false;
for (const e of out.errors || []) {
  console.error(e.formattedMessage);
  if (e.severity === 'error') failed = true;
}
if (failed) process.exit(1);
const art = path.join(dir, 'artifacts');
fs.mkdirSync(art, { recursive: true });
for (const [file, cs] of Object.entries(out.contracts)) {
  if (!sources[file]) continue;
  for (const [name, c] of Object.entries(cs)) {
    fs.writeFileSync(path.join(art, name + '.json'), JSON.stringify({ abi: c.abi, bytecode: '0x' + c.evm.bytecode.object }, null, 2));
    console.log('compiled', name);
  }
}
