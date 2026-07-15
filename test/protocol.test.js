import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import test from "node:test";

test("MCP server initializes and lists its tools", async (t) => {
  const server = spawn(process.execPath, ["src/index.js"], { stdio: ["pipe", "pipe", "pipe"] });
  const lines = createInterface({ input: server.stdout });
  t.after(() => server.kill());

  server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })}\n`);
  const initialized = JSON.parse((await once(lines, "line"))[0]);
  assert.equal(initialized.result.serverInfo.name, "fotmob");

  server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`);
  const listed = JSON.parse((await once(lines, "line"))[0]);
  assert.equal(listed.result.tools.length, 9);
  assert.ok(listed.result.tools.some(({ name }) => name === "get_match_prediction_context"));
});
