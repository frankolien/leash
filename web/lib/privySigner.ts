// Signs NEAR transactions with a Privy embedded wallet. near-api-js hashes each transaction and
// asks for the hash's signature; Privy signs it on the key's own curve without exposing the key.

import { PublicKey, Signer } from "near-api-js";

export type SignRawHash = (input: { address: string; chainType: "near"; hash: `0x${string}` }) => Promise<{ signature: `0x${string}` }>;

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));

export class PrivySigner extends Signer {
  constructor(private readonly address: string, private readonly publicKey: PublicKey, private readonly signRawHash: SignRawHash) {
    super();
  }

  async getPublicKey(): Promise<PublicKey> {
    return this.publicKey;
  }

  protected async signBytes(hash: Uint8Array): Promise<Uint8Array> {
    const { signature } = await this.signRawHash({ address: this.address, chainType: "near", hash: `0x${toHex(hash)}` });
    return fromHex(signature.slice(2));
  }
}

/// A Privy NEAR wallet's address is its implicit account: the public key's 32 bytes in hex.
export function publicKeyOfImplicit(address: string): PublicKey {
  return new PublicKey({ keyType: 0, data: fromHex(address) });
}
