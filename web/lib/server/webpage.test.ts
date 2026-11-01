import { describe, expect, it } from "vitest";
import { checkUrl, decodeEntities, isPrivateAddress, pageText } from "./webpage";
import { coinId } from "./paid";

describe("what the reader may fetch", () => {
  it("refuses private, loopback, link-local and metadata addresses in both families", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.9", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "224.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["93.184.216.34", "1.1.1.1", "2606:4700:4700::1111", "172.32.0.1"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });
  it("takes only http and https on the usual ports, without credentials", () => {
    expect(checkUrl("https://en.wikipedia.org/wiki/NEAR")).toBeInstanceOf(URL);
    expect(checkUrl("file:///etc/passwd")).toBe("only http and https URLs can be read");
    expect(checkUrl("http://example.com:6379/")).toBe("only the usual web ports can be read");
    expect(checkUrl("https://user:pw@example.com/")).toBe("URLs with credentials cannot be read");
    expect(checkUrl("not a url")).toBe("that is not a URL");
  });
});

describe("a page as text", () => {
  it("keeps the title, headings, list items and words, and drops scripts, styles and navigation", () => {
    const html = `<html><head><title>Leash &amp; agents</title><style>p{}</style></head><body><nav>Home About</nav><main><h1>Budgets</h1><p>Agents pay&nbsp;within <a href="/x">limits</a>.</p><ul><li>Daily cap</li><li>Approvals</li></ul><script>alert(1)</script></main><footer>©</footer></body></html>`;
    const { title, text } = pageText(html);
    expect(title).toBe("Leash & agents");
    expect(text).toBe("# Budgets\n\nAgents pay within limits .\n\n- Daily cap\n- Approvals");
  });
  it("decodes named and numeric entities", () => {
    expect(decodeEntities("&lt;b&gt; &#8364; &#x1F600; &unknown;")).toBe("<b> € 😀 &unknown;");
  });
  it("maps common tickers to price ids and refuses junk", () => {
    expect(coinId("NEAR")).toBe("near");
    expect(coinId("btc")).toBe("bitcoin");
    expect(coinId("render-token")).toBe("render-token");
    expect(coinId("../../etc")).toBeNull();
  });
});
