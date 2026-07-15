import assert from "node:assert/strict";
import test from "node:test";
import { fotmobRequest, summarizeAvailability, summarizeDetails, summarizeGameStateRecords, summarizeGoalkeepers, summarizeMatch, summarizePlayerWorkload, summarizePredictionContext, summarizeTeamForm, summarizeTeamSeasonProfile } from "../src/fotmob.js";
test("fotmobRequest throws useful HTTP errors", async () => {
  await assert.rejects(() => fotmobRequest("/bad", async () => ({ ok: false, status: 404, json: async () => ({}) })), /HTTP 404/);
});
test("summarizePredictionContext supplies live prediction inputs", () => {
  const result = summarizePredictionContext({ general: { matchId: "1", leagueName: "Cup" }, header: { teams: [{ name: "Home", score: 1 }, { name: "Away", score: 0 }], status: { started: true, liveTime: { short: "51'", long: "50:38" } } }, content: { matchFacts: { events: { events: [{ type: "Goal", timeStr: 50, isHome: true, player: { name: "Scorer" }, homeScore: 1, awayScore: 0 }] }, teamForm: [[], []] }, lineup: { homeTeam: { formation: "4-3-3", starters: [{ name: "Starter" }] }, awayTeam: { formation: "4-4-2", starters: [{ name: "Away starter" }] } }, momentum: { main: { data: [{ minute: 50, value: 10 }] } } } });
  assert.equal(result.match.clock.display, "51'");
  assert.equal(result.events[0].player, "Scorer");
  assert.equal(result.lineups.home.formation, "4-3-3");
  assert.equal(result.momentum.last5Minutes.home, 10);
});
test("summarizeTeamForm calculates results and venue splits", () => {
  const result = summarizeTeamForm({ details: { name: "Home" }, fixtures: { allFixtures: { fixtures: [{ id: 1, home: { id: 1, score: 2 }, away: { id: 2, score: 1 }, opponent: { name: "Away" }, tournament: { name: "Cup" }, status: { finished: true, utcTime: "2026-01-01T00:00:00Z" } }, { id: 2, home: { id: 3, score: 1 }, away: { id: 1, score: 1 }, opponent: { name: "Other" }, tournament: { name: "Cup" }, status: { finished: true, utcTime: "2026-01-02T00:00:00Z" } }] } } }, 1, 10);
  assert.deepEqual(result.summary.overall, { played: 2, wins: 1, draws: 1, losses: 0, goalsFor: 3, goalsAgainst: 2 });
  assert.equal(result.summary.home.wins, 1);
});
test("availability and workload expose only source-backed health and minutes", () => {
  const availability = summarizeAvailability({ details: { id: 1, name: "Team" }, squad: { squad: [{ members: [{ id: 2, name: "Injured", injured: true, injury: { expectedReturn: "July" }, role: { fallback: "Midfielder" } }] }] } });
  const workload = summarizePlayerWorkload({ id: 2, name: "Player", status: "active", recentMatches: [{ playedInMatch: true, minutesPlayed: 90, matchDate: { utcTime: "2026-01-01" } }, { playedInMatch: true, minutesPlayed: 60 }] });
  assert.equal(availability.injured[0].expectedReturn, "July");
  assert.equal(workload.workload.minutesLast3, 150);
});
test("goalkeeper and game-state summaries calculate requested evidence", () => {
  const keepers = summarizeGoalkeepers({ general: { matchId: "1" }, content: { playerStats: { "2": { id: 2, name: "Keeper", teamName: "Home", isGoalkeeper: true, stats: [{ stats: { Saves: { stat: { value: 3 } }, "Goals conceded": { stat: { value: 1 } }, "xGOT faced": { stat: { value: 2 } } } }] } } } });
  const states = summarizeGameStateRecords(
    1,
    [{ id: 1, home: { id: 1, score: 2 }, away: { id: 2, score: 1 }, status: { utcTime: "2026-01-01" }, opponent: { name: "Away" } }],
    /* @__PURE__ */ new Map([[1, { content: { matchFacts: { events: { events: [{ type: "Goal", time: 10, newScore: [1, 0] }] } } } }]])
  );
  assert.equal(keepers.goalkeepers[0].savePercentage, 75);
  assert.equal(states.summary.whenLeadingByOne.wins, 1);
});
test("team season profile exposes source xG and table data without a model", () => {
  const result = summarizeTeamSeasonProfile({ details: { name: "Team" }, overview: { table: [{ data: { tables: [{ leagueName: "League", leagueId: 7, table: { all: [{ id: 1, idx: 2, played: 3, wins: 2, draws: 0, losses: 1, scoresStr: "5-2", goalConDiff: 3, pts: 6 }], xg: [{ teamId: 1, xg: 4.2, xgConceded: 2.1, xgDiff: 2.1, xPoints: 5.5, xPosition: 2 }] } }] } }] } }, 1);
  assert.equal(result.seasons[0].expectedPerformance.xg, 4.2);
  assert.equal(result.seasons[0].standing.position, 2);
});
test("summarizeMatch returns a compact identifier and score", () => {
  assert.deepEqual(summarizeMatch({ id: 42, league: { name: "League" }, home: { name: "Home", score: 2 }, away: { name: "Away", score: 1 }, status: { finished: true } }), { id: 42, status: "Finished", competition: "League", home: { name: "Home", score: 2 }, away: { name: "Away", score: 1 }, time: void 0 });
});
test("summarizeDetails keeps current FotMob stats agent-readable", () => {
  const result = summarizeDetails({
    general: { matchId: "42", leagueName: "League" },
    header: { teams: [{ name: "Home", score: 2 }, { name: "Away", score: 1 }], status: { finished: true } },
    content: {
      stats: { Periods: { All: { stats: [{ stats: [{ title: "Possession", stats: ["60%", "40%"] }] }] } } },
      playerStats: { "1": { name: "Player", teamName: "Home", stats: [{ stats: { Goals: { stat: { value: 1 } } } }] } }
    }
  });
  assert.equal(result.stats[0].home, "60%");
  assert.equal(result.playerStats[0].stats.Goals, 1);
});
