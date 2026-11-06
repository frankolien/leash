# Code map

Where each piece of Leash lives. The README has the short version.

| Where | What |
| --- | --- |
| `contract/src/lib.rs` | State, init, the event emitter |
| `contract/src/types.rs` | Every struct the API speaks, and the storage keys |
| `contract/src/owner.rs` | What the owner's key may do: policies, kill switch, decisions, vault |
| `contract/src/agent.rs` | What an agent key may do: pay, request, ask for more |
| `contract/src/token.rs` | The NEP-141 callback and the settlement of every transfer |
| `contract/src/reports.rs` | The shared scam list: report, report by signed instruction, retract, reputation |
| `contract/src/facts.rs` | Signed facts about a stranger: the pinned relay key, the first-payment rule, the age and code-change checks |
| `contract/src/views.rs` | The read side |
| `contract/src/internals.rs` | The policy check, the ledger moves, the log, the storage billing |
| `contract/tests/` | Sandbox tests against a real node with a mock USDC |
| `mcp/src/` | `tools` (the tools), `leash` (policy, verdicts, counterparty facts, signed intents, calls), `counterparty` (allow, warn or block), `x402` (paid requests), `relay`, `safety` (lookalikes), `envelope`, `key`, `units` |
| `mcp/demo/` | The attack demo and the poisoned invoice it reads |
| `web/lib/server/x402.ts`, `web/app/api/x402/`, `web/app/api/paid/` | The x402 facilitator for Leash payments (`supported`, `verify`, `settle`), `paywall` and `sell` (charges only for work that succeeded), the one-cent sample and three paid services |
| `web/lib/server/paid.ts`, `webpage.ts` | What the paid services do: Wikipedia search, token prices, and reading a public page safely (public addresses only, every redirect checked, size and time caps) |
| `web/lib/server/relay.ts`, `alerts.ts`, `apns.ts` | The relay that delivers signed intents and pays their gas, and the push to the owner's phones |
| `cli/src/` | The owner's commands: `config`, `units`, `chain`, and `commands/` (setup, money, agents, decisions, read) |
| `web/lib/` | `reader` (RPC views), `wallet` (HOT Connect), `format` (money and time), `activity` (how events read), `insights` (today's spend, the week, request facts, recipients), `types` |
| `web/lib/session.ts`, `privySigner.ts`, `config.ts` | One signing session for NEAR wallets and embedded wallets; the shared contract per network |
| `web/lib/server/`, `web/app/api/onboard/` | The sign-up sponsor: verifies the Privy token, funds and readies a new account |
| `web/components/auth/` | Sign-in: context, Privy bridge, dialog, the `/app` entry |
| `web/hooks/` | `useSnapshot` (polling), `useWallet` (session and the one way to write), `useNames`, `useToast`, `useActiveSection`, `useHeroHandoff` (the timed scroll handoff) |
| `web/components/site/` | The header, footer and the drifting ground every page shares |
| `web/components/landing/` | The landing page: `FilmSequence` (the film closing into `DashboardScene`), `HeroFilm` and `GlassMark`, `Stories`, `HowItHolds` and `Wireframe`, `WorksWith`, `Closing` |
| `web/components/dashboard/` | The owner's app: `Sidebar`, `PageHeader` and six views (`views.ts`): `VaultCard`, `AgentsCard`, `ActivityCard`, `ApprovalPanel` (opens only while a payment waits), `NewAgentDialog`, `AgentList` and `ConnectCard`, `RecipientsView`, `SettingsView`, composed in `Dashboard` |
| `web/components/setup/` | The agent setup steps and dialog, shared by the landing and the dashboard |
| `web/components/charts/` | `SpendChart`, shared by the dashboard and the landing preview |

