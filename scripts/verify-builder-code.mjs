// Verify Base Builder Code is baked into the deployed JS bundle on vibefunds.app.
// Usage: node scripts/verify-builder-code.mjs [origin]
//   origin defaults to https://www.vibefunds.app

import https from "node:https";

const ROOT = (process.argv[2] || "https://www.vibefunds.app").replace(/\/$/, "");
const ENTRY_PATHS = ["/swap", "/forex", "/stake", "/liquidity"];
const BUILDER_CODE = "bc_beg0pkcm";
const ERC8021_MARKER_FRAG = "8021802180218021"; // partial — enough to identify

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () =>
          resolve({ status: res.statusCode || 0, body, url }),
        );
      })
      .on("error", reject);
  });
}

function extractScriptUrls(html) {
  const out = new Set();
  // Match any /_next/static/...js whether quoted, in JSON, or in script tags.
  const re = /\/_next\/static\/[A-Za-z0-9_\-/.]+\.js/g;
  let m;
  while ((m = re.exec(html))) {
    out.add(ROOT + m[0]);
  }
  return [...out];
}

function asciiPayloadHex(s) {
  return [...new TextEncoder().encode(s)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function main() {
  const builderHexFragment = asciiPayloadHex(BUILDER_CODE).toLowerCase();
  console.log("Looking for ascii hex of code:", builderHexFragment);

  const scripts = new Set();
  for (const p of ENTRY_PATHS) {
    try {
      const { status, body } = await get(ROOT + p);
      console.log(`Fetched ${p} (${status}, ${body.length} bytes)`);
      for (const s of extractScriptUrls(body)) scripts.add(s);
    } catch (e) {
      console.log(`Skip ${p}: ${e.message}`);
    }
  }

  console.log(`Total unique scripts: ${scripts.size}`);

  let foundRaw = false;
  let foundEncoded = false;
  let foundMarker = false;
  let firstMatch = null;

  for (const url of scripts) {
    try {
      const { body } = await get(url);
      if (body.includes(BUILDER_CODE)) {
        foundRaw = true;
        firstMatch ||= url;
      }
      if (body.toLowerCase().includes(builderHexFragment)) {
        foundEncoded = true;
        firstMatch ||= url;
      }
      if (body.includes(ERC8021_MARKER_FRAG)) {
        foundMarker = true;
      }
    } catch (e) {
      console.log("fail", url, e.message);
    }
  }

  console.log("\n=== RESULT ===");
  console.log("Raw builder code present:    ", foundRaw);
  console.log("Encoded ascii hex present:   ", foundEncoded);
  console.log("ERC-8021 marker fragment hit:", foundMarker);
  if (firstMatch) console.log("First matching chunk:", firstMatch);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
