export function usage(): never {
  console.log(`leash <command> [options]

  init      --owner <account> [--network testnet] [--owner-key <file>] [--own-contract [--wasm <path>]]
            Join the shared Leash contract: register on USDC, put down storage credit, save ~/.leash/config.json
            --own-contract deploys a private instance at leash.<owner> instead (about 4 NEAR)
  deposit   <usdc>                      Move USDC from the owner into the Leash vault
  withdraw  <usdc>                      Move USDC from the vault back to the owner
  grant     --name <agent> --daily <usdc> --per-payment <usdc> [--to a.near,b.near] [--cooldown <secs>] [--ttl <2h|3d>]
            Make a key for an agent, add it to the owner's account, set its policy, write ~/.leash/<agent>.json
  revoke    <agent>                     Policy off and key deleted from the account
  pause | resume                        Kill switch for every agent key
  approve   <id> [--force] | deny <id>  Decide a parked request; approve refuses an unregistered recipient unless forced
  register  <account>                   Pay an account's registration on the token so it can receive USDC
  proposals | dismiss <id>              What agents asked for beyond their policy, and clearing a note
  window    <secs>                      How long a parked request waits for you (default 3600)
  status | requests | log               What the agents can do, want to do, and did
`);
  process.exit(1);
}
