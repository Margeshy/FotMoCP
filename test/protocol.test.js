import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import test from "node:test";

async function request(server, lines, message) {
  server.stdin.write(`${typeof message === "string" ? message : JSON.stringify(message)}\n`);
  return JSON.parse((await once(lines, "line"))[0]);
}

test("MCP server handles discovery, errors, and notifications", async (t) => {
  const server = spawn(process.execPath, ["src/index.js"], { stdio: ["pipe", "pipe", "pipe"] });
  const lines = createInterface({ input: server.stdout });
  t.after(() => server.kill());

  const initialized = await request(server, lines, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  assert.equal(initialized.result.serverInfo.name, "fotmob");

  const listed = await request(server, lines, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  assert.equal(listed.result.tools.length, 10);
  assert.ok(listed.result.tools.some(({ name }) => name === "get_match_prediction_context"));
  assert.ok(listed.result.tools.some(({ name }) => name === "search_fotmob"));

  const invalidJson = await request(server, lines, "{");
  assert.deepEqual(invalidJson.error, { code: -32700, message: "Parse error" });

  const unknownMethod = await request(server, lines, { jsonrpc: "2.0", id: 3, method: "unknown" });
  assert.equal(unknownMethod.error.code, -32601);

  const unknownTool = await request(server, lines, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "unknown" } });
  assert.equal(unknownTool.error.code, -32602);

  const invalidArguments = await request(server, lines, { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "get_match_stats", arguments: { matchId: 0 } } });
  assert.equal(invalidArguments.result.isError, true);
  assert.match(invalidArguments.result.content[0].text, /positive match ID or FotMob URL/);

  const toolError = await request(server, lines, { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "search_fotmob", arguments: { query: "x" } } });
  assert.equal(toolError.result.isError, true);
  assert.match(toolError.result.content[0].text, /at least 2 characters/);

  server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
  const ping = await request(server, lines, { jsonrpc: "2.0", id: 7, method: "ping" });
  assert.equal(ping.id, 7);
});
