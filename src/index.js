import {
  expectedGoals,
  fotmobRequest,
  recentFixtures,
  summarizeAvailability,
  summarizeDetails,
  summarizeGameStateRecords,
  summarizeGoalkeepers,
  summarizeMatch,
  summarizePlayerWorkload,
  summarizePredictionContext,
  summarizeTeamForm,
  summarizeTeamSeasonProfile,
} from "./fotmob.js";

const integer = { type: "integer", minimum: 1 };
const limit = { type: "integer", minimum: 5, maximum: 20, default: 10 };
const schema = (properties, required) => ({ type: "object", properties, required, additionalProperties: false });

function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function historyLimit(value) {
  if (value === undefined) return 10;
  if (!Number.isInteger(value) || value < 5 || value > 20) throw new Error("limit must be an integer from 5 to 20");
  return value;
}

const matchDetails = (matchId) => fotmobRequest(`/matchDetails?matchId=${positiveInteger(matchId, "matchId")}`);
const teamData = (teamId) => fotmobRequest(`/teams?id=${positiveInteger(teamId, "teamId")}`);

const tools = [
  {
    name: "find_matches",
    description: "Find FotMob matches scheduled or played on a UTC date. Use this before match tools when you need a match ID.",
    inputSchema: schema({ date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" } }, ["date"]),
    async run({ date }) {
      if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date must use YYYY-MM-DD");
      const data = await fotmobRequest(`/matches?date=${date.replaceAll("-", "")}`);
      return (data.leagues ?? []).flatMap((league) => (league.matches ?? []).map((match) => summarizeMatch({ ...match, league: { name: league.name } })));
    },
  },
  {
    name: "get_team_season_profile",
    description: "Return season table position, results, xG, xGA, xPoints, and FIFA ranking when FotMob provides them.",
    inputSchema: schema({ teamId: integer }, ["teamId"]),
    async run({ teamId }) { return summarizeTeamSeasonProfile(await teamData(teamId), teamId); },
  },
  {
    name: "get_team_availability",
    description: "Return FotMob-reported injured players and expected return dates for a team.",
    inputSchema: schema({ teamId: integer }, ["teamId"]),
    async run({ teamId }) { return summarizeAvailability(await teamData(teamId)); },
  },
  {
    name: "get_player_workload",
    description: "Return recent match minutes, last-match time, and FotMob injury status for a player.",
    inputSchema: schema({ playerId: integer }, ["playerId"]),
    async run({ playerId }) { return summarizePlayerWorkload(await fotmobRequest(`/playerData?id=${positiveInteger(playerId, "playerId")}`)); },
  },
  {
    name: "get_goalkeeper_match_stats",
    description: "Return goalkeeper saves, shots on target faced, save percentage, xGOT faced, and goals prevented for a match.",
    inputSchema: schema({ matchId: integer }, ["matchId"]),
    async run({ matchId }) { return summarizeGoalkeepers(await matchDetails(matchId)); },
  },
  {
    name: "get_team_game_state_record",
    description: "Return how a team finished recent matches after leading or trailing, using FotMob goal-event history.",
    inputSchema: schema({ teamId: integer, limit }, ["teamId"]),
    async run({ teamId, limit: requestedLimit }) {
      const count = historyLimit(requestedLimit);
      const team = await teamData(teamId);
      const fixtures = recentFixtures(team, count);
      const details = await Promise.all(fixtures.map(async (fixture) => {
        try { return [fixture.id, await matchDetails(fixture.id)]; }
        catch { return [fixture.id, null]; }
      }));
      return summarizeGameStateRecords(teamId, fixtures, new Map(details));
    },
  },
  {
    name: "get_match_prediction_context",
    description: "Return clock, events, lineups, momentum, form, head-to-head, weather, venue, and tournament context.",
    inputSchema: schema({ matchId: integer }, ["matchId"]),
    async run({ matchId }) { return summarizePredictionContext(await matchDetails(matchId)); },
  },
  {
    name: "get_team_form",
    description: "Return recent results, home/away splits, ranking, and available per-match xG.",
    inputSchema: schema({ teamId: integer, limit }, ["teamId"]),
    async run({ teamId, limit: requestedLimit }) {
      const count = historyLimit(requestedLimit);
      const team = await teamData(teamId);
      const fixtures = recentFixtures(team, count);
      const xg = await Promise.all(fixtures.map(async (fixture) => {
        try { return [fixture.id, expectedGoals(await matchDetails(fixture.id))]; }
        catch { return [fixture.id, {}]; }
      }));
      return summarizeTeamForm(team, teamId, count, new Map(xg));
    },
  },
  {
    name: "get_match_stats",
    description: "Return a match score plus deduplicated team and active-player statistics.",
    inputSchema: schema({ matchId: integer }, ["matchId"]),
    async run({ matchId }) { return summarizeDetails(await matchDetails(matchId)); },
  },
];

const publicTools = tools.map(({ run, ...tool }) => tool);

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function handle(message) {
  if (!message || message.jsonrpc !== "2.0" || !("method" in message)) return;
  if (!("id" in message)) return;
  const reply = (result) => send({ jsonrpc: "2.0", id: message.id, result });
  const error = (code, text) => send({ jsonrpc: "2.0", id: message.id, error: { code, message: text } });

  if (message.method === "initialize") {
    return reply({
      protocolVersion: "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "fotmob", version: "0.1.0" },
    });
  }
  if (message.method === "ping") return reply({});
  if (message.method === "tools/list") return reply({ tools: publicTools });
  if (message.method !== "tools/call") return error(-32601, "Method not found");

  const tool = tools.find((candidate) => candidate.name === message.params?.name);
  if (!tool) return error(-32602, `Unknown tool: ${message.params?.name ?? ""}`);
  try {
    const result = await tool.run(message.params?.arguments ?? {});
    return reply({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
  } catch (cause) {
    const text = cause instanceof Error ? cause.message : String(cause);
    return reply({ content: [{ type: "text", text: `Error: ${text}` }], isError: true });
  }
}

let buffer = "";
let queue = Promise.resolve();
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    queue = queue.then(() => handle(JSON.parse(line))).catch((cause) => {
      process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
    });
  }
});
