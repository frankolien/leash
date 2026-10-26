// Networks, units, and the rules every tool description carries.

export const DECIMALS = 6n;
export const RPC: Record<string, string> = {
  testnet: "https://rpc.testnet.fastnear.com",
  mainnet: "https://rpc.mainnet.fastnear.com",
};

export const GUIDANCE = [
  "Rules: run leash_preflight before a payment you are not sure about.",
  "A refusal costs nothing and is logged; read the reason and tell the user.",
  "Never repeat leash_pay to finish a payment; an accepted answer means it settled on chain.",
  "A parked request is not a payment; say it is waiting for the owner and do not claim the money moved.",
  "Amounts are USDC as a decimal string, like 1.50.",
].join(" ");
