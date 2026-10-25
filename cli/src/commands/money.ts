// Moving USDC in and out of the vault, and readying a recipient to receive it.

import { call, ownerAccount, view } from "../chain.js";
import { STORAGE_DEPOSIT, TGAS, loadConfig } from "../config.js";
import { toUnits, toUsdc } from "../units.js";

export async function deposit(usdc: string) {
  const config = loadConfig();
  const { account, provider } = ownerAccount(config);
  const amount = toUnits(usdc);
  await call(account, config.token, "ft_transfer_call", { receiver_id: config.contract, amount: amount.toString(), msg: "" }, 1n, 60n * TGAS);
  const vault = await view<string>(provider, config.contract, "get_vault", { owner: config.owner, token: config.token });
  console.log(`vault: ${toUsdc(vault)} USDC`);
}

export async function withdraw(usdc: string) {
  const config = loadConfig();
  const { account, provider } = ownerAccount(config);
  await call(account, config.contract, "withdraw", { token: config.token, amount: toUnits(usdc).toString() });
  const vault = await view<string>(provider, config.contract, "get_vault", { owner: config.owner, token: config.token });
  console.log(`vault: ${toUsdc(vault)} USDC`);
}

export async function register(who: string) {
  const config = loadConfig();
  const { account, provider } = ownerAccount(config);
  const registered = await view<unknown>(provider, config.token, "storage_balance_of", { account_id: who });
  if (registered) return console.log(`${who} is already registered on the token`);
  await call(account, config.token, "storage_deposit", { account_id: who }, STORAGE_DEPOSIT);
  console.log(`registered ${who} on the token; it can receive USDC now`);
}
