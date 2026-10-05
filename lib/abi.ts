export const tokenFactoryAbi = [
  {
    type: 'function', name: 'createToken', stateMutability: 'nonpayable',
    inputs: [
      { name: 'name', type: 'string' }, { name: 'symbol', type: 'string' },
      { name: 'decimals', type: 'uint8' }, { name: 'supply', type: 'uint256' },
      { name: 'category', type: 'string' }, { name: 'metadataURI', type: 'string' },
    ],
    outputs: [{ name: 'token', type: 'address' }],
  },
  {
    type: 'event', name: 'TokenCreated',
    inputs: [
      { name: 'creator', type: 'address', indexed: true }, { name: 'token', type: 'address', indexed: true },
      { name: 'name', type: 'string', indexed: false }, { name: 'symbol', type: 'string', indexed: false },
    ],
  },
] as const;

export const dataProofAbi = [
  { type: 'function', name: 'submit', stateMutability: 'nonpayable',
    inputs: [{ name: 'hash', type: 'bytes32' }, { name: 'uri', type: 'string' }], outputs: [] },
] as const;
