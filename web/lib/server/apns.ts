// Alerts to phones through APNs. Token authentication: a JWT signed with the team's push key, good
// for an hour, over HTTP/2, which Apple requires and fetch does not speak.

import { connect } from "node:http2";
import { SignJWT, importPKCS8 } from "jose";

export const BUNDLE_ID = "com.frankolien.leash";
export type ApnsEnvironment = "sandbox" | "production";
export type ApnsOutcome = "sent" | "gone" | "failed";

const HOST: Record<ApnsEnvironment, string> = { sandbox: "https://api.sandbox.push.apple.com", production: "https://api.push.apple.com" };
// Apple wants a fresh token at least every hour and not more often than every twenty minutes.
const TOKEN_LIFETIME_MS = 50 * 60_000;

let signingKey: ReturnType<typeof importPKCS8> | undefined;
let bearer: { value: string; made: number } | undefined;

export function apnsConfigured(): boolean {
  return Boolean(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_KEY_P8);
}

async function token(): Promise<string> {
  if (bearer && Date.now() - bearer.made < TOKEN_LIFETIME_MS) return bearer.value;
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const p8 = process.env.APNS_KEY_P8?.replace(/\\n/g, "\n");
  if (!keyId || !teamId || !p8) throw new Error("APNs is not configured");
  signingKey ??= importPKCS8(p8, "ES256");
  const value = await new SignJWT({}).setProtectedHeader({ alg: "ES256", kid: keyId }).setIssuer(teamId).setIssuedAt().sign(await signingKey);
  bearer = { value, made: Date.now() };
  return value;
}

export type Push = {
  payload: Record<string, unknown>;
  /// Later pushes with the same id replace this one on the phone.
  collapseId?: string;
  /// Seconds since the epoch after which Apple stops trying to deliver it.
  expires?: number;
  type?: "alert" | "liveactivity";
};

/// One push to one phone. "gone" means Apple no longer knows the token, so the caller forgets it.
export async function push(deviceToken: string, environment: ApnsEnvironment, p: Push): Promise<ApnsOutcome> {
  const type = p.type ?? "alert";
  const headers: Record<string, string> = {
    ":method": "POST",
    ":path": `/3/device/${deviceToken}`,
    authorization: `bearer ${await token()}`,
    "apns-topic": type === "liveactivity" ? `${BUNDLE_ID}.push-type.liveactivity` : BUNDLE_ID,
    "apns-push-type": type,
    "apns-priority": "10",
    "content-type": "application/json",
  };
  if (p.collapseId) headers["apns-collapse-id"] = p.collapseId;
  if (p.expires) headers["apns-expiration"] = String(p.expires);
  const body = JSON.stringify(p.payload);
  const client = connect(HOST[environment]);
  try {
    return await new Promise<ApnsOutcome>((resolve, reject) => {
      const req = client.request(headers);
      let status = 0;
      let text = "";
      req.setEncoding("utf8");
      req.on("response", (h) => { status = Number(h[":status"]); });
      req.on("data", (chunk: string) => { text += chunk; });
      req.on("end", () => {
        if (status === 200) return resolve("sent");
        const reason = (() => { try { return (JSON.parse(text) as { reason?: string }).reason; } catch { return undefined; } })();
        if (status === 410 || reason === "BadDeviceToken" || reason === "Unregistered") return resolve("gone");
        console.error(`apns ${status} ${reason ?? text}`);
        resolve("failed");
      });
      req.on("error", reject);
      req.end(body);
    });
  } finally {
    client.close();
  }
}
