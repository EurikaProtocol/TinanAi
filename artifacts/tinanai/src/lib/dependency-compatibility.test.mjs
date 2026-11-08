import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { EthereumProvider } from "@walletconnect/ethereum-provider";

const require = createRequire(import.meta.url);
const appkitRequire = createRequire(require.resolve("@reown/appkit"));
const walletEntry = appkitRequire.resolve("@reown/appkit-wallet");
// Exercise the actual transitive schemas rather than duplicating their definitions.
const schemas = await import(new URL("../src/W3mFrameSchema.js", pathToFileURL(walletEntry)));

test("AppKit wallet schemas accept valid themes with the patched Zod runtime", () => {
  assert.equal(schemas.AppSyncThemeRequest.safeParse({
    themeMode: "dark",
    themeVariables: { "--w3m-accent": "#123456", "--w3m-z-index": 100 },
  }).success, true);
  assert.equal(schemas.AppConnectEmailRequest.safeParse({ email: "fixture@example.test" }).success, true);
  assert.equal(schemas.AppConnectEmailRequest.safeParse({ email: "invalid" }).success, false);
  assert.equal(schemas.AppSyncThemeRequest.safeParse({ themeVariables: { invalid: [] } }).success, false);
});

test("aligned WalletConnect provider exposes its initialization API without connecting", () => {
  assert.equal(typeof EthereumProvider.init, "function");
  const connectorRequire = createRequire(require.resolve("@wagmi/connectors"));
  assert.equal(
    connectorRequire.resolve("@walletconnect/ethereum-provider"),
    require.resolve("@walletconnect/ethereum-provider"),
  );
});
