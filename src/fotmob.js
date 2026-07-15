const API_BASE = "https://www.fotmob.com/api/data";
async function fotmobRequest(path, fetcher = fetch) {
  const response = await fetcher(`${API_BASE}${path}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15e3)
  });
  if (!response.ok) throw new Error(`FotMob request failed with HTTP ${response.status}`);
  return response.json();
}
function recentFixtures(team, limit) {
  return (team.fixtures?.allFixtures?.fixtures ?? []).filter((fixture) => fixture.status?.finished).sort((a, b) => Date.parse(b.status.utcTime) - Date.parse(a.status.utcTime)).slice(0, limit);
}
function summarizeMatch(match) {
  return {
    id: match.id,
    status: match.status?.finished ? "Finished" : match.status?.started ? "Live" : "Not started",
    competition: match.league?.name,
    home: { name: match.home?.name, score: match.home?.score },
    away: { name: match.away?.name, score: match.away?.score },
    time: match.status?.utcTime
  };
}
function summarizeDetails(data) {
  const general = data.general ?? {};
  const header = data.header ?? {};
  const content = data.content ?? {};
  const allStats = content.stats?.Periods?.All?.stats ?? [];
  const stats = [...new Map(allStats.flatMap((group) => group.stats ?? []).filter((stat) => stat.type !== "title").map((stat) => [stat.key ?? stat.title, { name: stat.title, home: stat.stats?.[0], away: stat.stats?.[1] }])).values()];
  const players = Object.values(content.playerStats ?? {});
  const playerSummaries = players.map((player) => ({ name: player.name, team: player.teamName, stats: playerStats(player) })).filter((player) => Object.keys(player.stats).length > 0);
  return {
    match: {
      id: Number(general.matchId),
      competition: general.leagueName,
      status: header.status?.finished ? "Finished" : header.status?.started ? "Live" : "Not started",
      home: { name: header.teams?.[0]?.name, score: header.teams?.[0]?.score },
      away: { name: header.teams?.[1]?.name, score: header.teams?.[1]?.score },
      startedAt: general.matchTimeUTCDate
    },
    stats,
    playerStats: playerSummaries
  };
}
function teamName(isHome, home, away) {
  return isHome === true ? home : isHome === false ? away : void 0;
}
function summarizeLineup(team) {
  return {
    name: team?.name,
    formation: team?.formation,
    coach: team?.coach?.name,
    starters: (team?.starters ?? []).map((player) => ({
      id: player.id,
      name: player.name,
      shirtNumber: player.shirtNumber,
      captain: player.isCaptain === true,
      rating: player.performance?.rating,
      seasonRating: player.performance?.seasonRating
    })),
    substitutes: (team?.subs ?? []).map((player) => ({ id: player.id, name: player.name, shirtNumber: player.shirtNumber }))
  };
}
function summarizeEvent(event, home, away) {
  return {
    minute: event.timeStr ?? event.time,
    addedMinute: event.overloadTimeStr || void 0,
    type: event.type,
    team: teamName(event.isHome, home, away),
    player: event.player?.name ?? event.nameStr,
    assist: event.assistStr ?? event.assist?.name,
    substitution: event.type === "Substitution" ? { out: event.swap?.[0]?.name, in: event.swap?.[1]?.name, injury: event.injuredPlayerOut === true } : void 0,
    card: event.card,
    score: event.newScore ? `${event.newScore[0]}-${event.newScore[1]}` : event.homeScore === void 0 ? void 0 : `${event.homeScore}-${event.awayScore}`,
    detail: event.minutesAddedStr ?? event.halfStrShort
  };
}
function summarizeMomentum(data) {
  const values = (data?.main?.data ?? []).filter((point) => point.value !== null && point.value !== void 0);
  const latestMinute = values.at(-1)?.minute;
  const window = (minutes) => {
    const points = values.filter((point) => point.minute > (latestMinute ?? 0) - minutes);
    return {
      home: points.reduce((total, point) => total + Math.max(point.value, 0), 0),
      away: points.reduce((total, point) => total + Math.abs(Math.min(point.value, 0)), 0)
    };
  };
  return {
    latestMinute,
    direction: "Positive values favor the home team; negative values favor the away team.",
    last5Minutes: window(5),
    last10Minutes: window(10),
    last15Minutes: window(15),
    recentTimeline: values.filter((point) => point.minute > (latestMinute ?? 0) - 15)
  };
}
function momentumInWindow(data, start, end) {
  const values = (data?.main?.data ?? []).filter((point) => point.value !== null && point.minute > start && point.minute <= end);
  return {
    home: values.reduce((total, point) => total + Math.max(point.value, 0), 0),
    away: values.reduce((total, point) => total + Math.abs(Math.min(point.value, 0)), 0)
  };
}
function summarizeForm(form) {
  return (form ?? []).map((match) => ({
    date: match.date?.utcTime,
    result: match.resultString,
    home: match.tooltipText?.homeTeam,
    away: match.tooltipText?.awayTeam,
    score: match.score
  }));
}
function summarizePredictionContext(data) {
  const general = data.general ?? {};
  const header = data.header ?? {};
  const content = data.content ?? {};
  const facts = content.matchFacts ?? {};
  const home = header.teams?.[0]?.name;
  const away = header.teams?.[1]?.name;
  const status = header.status ?? {};
  const events = facts.events?.events ?? [];
  const tournament = facts.infoBox?.Tournament ?? {};
  const recentH2H = (content.h2h?.matches ?? []).filter((match) => Date.parse(match.time?.utcTime) >= Date.now() - 10 * 365.25 * 24 * 60 * 60 * 1e3);
  return {
    match: {
      id: Number(general.matchId),
      competition: general.leagueName,
      round: general.leagueRoundName,
      home: { id: header.teams?.[0]?.id, name: home, score: header.teams?.[0]?.score },
      away: { id: header.teams?.[1]?.id, name: away, score: header.teams?.[1]?.score },
      clock: {
        state: status.finished ? "Finished" : status.started ? "Live" : "Not started",
        display: status.liveTime?.short ?? status.reason?.short,
        preciseTime: status.liveTime?.long,
        addedTime: status.liveTime?.addedTime,
        scheduledAt: status.utcTime
      },
      redCards: { home: status.numberOfHomeRedCards, away: status.numberOfAwayRedCards }
    },
    events: events.map((event) => summarizeEvent(event, home, away)),
    stateChanges: events.filter((event) => ["Card", "Substitution"].includes(event.type)).map((event) => ({
      ...summarizeEvent(event, home, away),
      momentumNext5Minutes: momentumInWindow(content.momentum, event.time ?? 0, (event.time ?? 0) + 5)
    })),
    lineups: {
      home: summarizeLineup(content.lineup?.homeTeam),
      away: summarizeLineup(content.lineup?.awayTeam),
      note: "Use the substitution events to update the starting elevens to the current on-pitch players."
    },
    momentum: summarizeMomentum(content.momentum),
    recentForm: { home: summarizeForm(facts.teamForm?.[0]), away: summarizeForm(facts.teamForm?.[1]) },
    headToHead: {
      allTimeSummary: content.h2h?.summary,
      recentMatches: recentH2H.slice(0, 10).map((match) => ({
        date: match.time?.utcTime,
        competition: match.league?.name,
        home: match.home?.name,
        away: match.away?.name,
        score: match.status?.scoreStr,
        result: match.status?.reason?.short
      })),
      note: "Recent head-to-head is limited to the last 10 years; an empty list means FotMob has no recent meeting."
    },
    competitionContext: {
      name: tournament.leagueName,
      round: tournament.roundName,
      legInfo: facts.infoBox?.legInfo,
      table: content.table || null,
      insights: (facts.insights ?? []).map((insight) => insight.text)
    },
    venue: {
      stadium: facts.infoBox?.Stadium?.name,
      city: facts.infoBox?.Stadium?.city,
      country: facts.infoBox?.Stadium?.country,
      capacity: facts.infoBox?.Stadium?.capacity,
      surface: facts.infoBox?.Stadium?.surface,
      referee: facts.infoBox?.Referee?.text,
      weather: content.weather ? {
        description: content.weather.description,
        temperatureCelsius: content.weather.temperature,
        humidityPercent: content.weather.relativeHumidity,
        windSpeed: content.weather.windSpeed,
        precipitation: content.weather.precipitation,
        updatedAt: content.weather.lastUpdated
      } : null
    }
  };
}
function summarizeFixture(fixture, teamId, xg) {
  const isHome = Number(fixture.home?.id) === teamId;
  const teamScore = Number(isHome ? fixture.home?.score : fixture.away?.score);
  const opponentScore = Number(isHome ? fixture.away?.score : fixture.home?.score);
  return {
    id: fixture.id,
    date: fixture.status?.utcTime,
    competition: fixture.tournament?.name,
    venue: isHome ? "home" : "away",
    opponent: fixture.opponent?.name,
    result: teamScore > opponentScore ? "W" : teamScore < opponentScore ? "L" : "D",
    score: `${teamScore}-${opponentScore}`,
    goalsFor: teamScore,
    goalsAgainst: opponentScore,
    xgFor: isHome ? xg?.home : xg?.away,
    xgAgainst: isHome ? xg?.away : xg?.home
  };
}
function summarizeTeamForm(data, teamId, limit, xgByMatchId = /* @__PURE__ */ new Map()) {
  const fixtures = (data.fixtures?.allFixtures?.fixtures ?? []).filter((fixture) => fixture.status?.finished).sort((a, b) => Date.parse(b.status.utcTime) - Date.parse(a.status.utcTime)).slice(0, limit).map((fixture) => summarizeFixture(fixture, teamId, xgByMatchId.get(fixture.id)));
  const record = (matches) => ({
    played: matches.length,
    wins: matches.filter((match) => match.result === "W").length,
    draws: matches.filter((match) => match.result === "D").length,
    losses: matches.filter((match) => match.result === "L").length,
    goalsFor: matches.reduce((total, match) => total + match.goalsFor, 0),
    goalsAgainst: matches.reduce((total, match) => total + match.goalsAgainst, 0)
  });
  return {
    team: { id: teamId, name: data.details?.name, fifaRanking: data.details?.fifaRanking?.rank, fifaPoints: data.details?.fifaRanking?.points },
    summary: { overall: record(fixtures), home: record(fixtures.filter((match) => match.venue === "home")), away: record(fixtures.filter((match) => match.venue === "away")) },
    matches: fixtures
  };
}
function expectedGoals(data) {
  const stats = data.content?.stats?.Periods?.All?.stats ?? [];
  const xg = stats.flatMap((group) => group.stats ?? []).find((stat) => stat.key === "expected_goals");
  return { home: xg?.stats?.[0], away: xg?.stats?.[1] };
}
function playerStats(player) {
  return Object.fromEntries(player.stats?.flatMap((group) => Object.entries(group.stats ?? {}).map(([label, value]) => [label, value.stat?.value])) ?? []);
}
function summarizeAvailability(data) {
  const groups = Array.isArray(data.squad) ? data.squad : data.squad?.squad ?? [];
  const members = groups.flatMap((group) => group.members ?? []);
  return {
    team: { id: data.details?.id, name: data.details?.name },
    injured: members.filter((member) => member.injured || member.injury).map((member) => ({
      id: member.id,
      name: member.name,
      position: member.role?.fallback,
      expectedReturn: member.injury?.expectedReturn
    }))
  };
}
function summarizePlayerWorkload(data) {
  const matches = data.recentMatches ?? [];
  const played = matches.filter((match) => match.playedInMatch);
  const minutes = (count) => played.slice(0, count).reduce((total, match) => total + (match.minutesPlayed ?? 0), 0);
  return {
    player: {
      id: data.id,
      name: data.name,
      position: data.positionDescription?.primaryPosition?.label,
      injury: data.injuryInformation,
      status: data.status
    },
    workload: { minutesLast3: minutes(3), minutesLast5: minutes(5), minutesLast10: minutes(10), lastMatchAt: played[0]?.matchDate?.utcTime },
    recentMatches: played.slice(0, 10).map((match) => ({
      date: match.matchDate?.utcTime,
      team: match.teamName,
      opponent: match.opponentTeamName,
      competition: match.leagueName,
      minutes: match.minutesPlayed,
      rating: match.ratingProps?.rating
    }))
  };
}
function summarizeGoalkeepers(data) {
  const general = data.general ?? {};
  const header = data.header ?? {};
  return {
    match: { id: Number(general.matchId), home: header.teams?.[0]?.name, away: header.teams?.[1]?.name },
    goalkeepers: Object.values(data.content?.playerStats ?? {}).filter((player) => player.isGoalkeeper && player.stats?.length).map((player) => {
      const stats = playerStats(player);
      const saves = Number(stats.Saves ?? 0);
      const conceded = Number(stats["Goals conceded"] ?? 0);
      const onTargetFaced = saves + conceded;
      return {
        id: player.id,
        name: player.name,
        team: player.teamName,
        rating: stats["FotMob rating"],
        saves,
        goalsConceded: conceded,
        shotsOnTargetFaced: onTargetFaced,
        savePercentage: onTargetFaced ? Number((saves / onTargetFaced * 100).toFixed(1)) : null,
        xgotFaced: stats["xGOT faced"],
        goalsPrevented: stats["Goals prevented"]
      };
    })
  };
}
function outcome(home, away, teamIsHome) {
  const team = teamIsHome ? home : away;
  const opponent = teamIsHome ? away : home;
  return team > opponent ? "W" : team < opponent ? "L" : "D";
}
function summarizeGameStateRecords(teamId, fixtures, detailsByMatch) {
  const matches = fixtures.map((fixture) => {
    const isHome = Number(fixture.home?.id) === teamId;
    const details = detailsByMatch.get(fixture.id);
    const goals = (details?.content?.matchFacts?.events?.events ?? []).filter((event) => event.type === "Goal" && event.newScore).sort((a, b) => Number(a.time) - Number(b.time));
    let led = false;
    let trailed = false;
    let ledByOne = false;
    let trailedByOne = false;
    for (const goal of goals) {
      const difference = isHome ? goal.newScore[0] - goal.newScore[1] : goal.newScore[1] - goal.newScore[0];
      led ||= difference > 0;
      trailed ||= difference < 0;
      ledByOne ||= difference === 1;
      trailedByOne ||= difference === -1;
    }
    return { id: fixture.id, date: fixture.status?.utcTime, opponent: fixture.opponent?.name, result: outcome(Number(fixture.home?.score), Number(fixture.away?.score), isHome), led, trailed, ledByOne, trailedByOne };
  });
  const record = (filter) => {
    const selected = matches.filter(filter);
    return { matches: selected.length, wins: selected.filter((match) => match.result === "W").length, draws: selected.filter((match) => match.result === "D").length, losses: selected.filter((match) => match.result === "L").length };
  };
  return {
    teamId,
    summary: { whenEverLeading: record((match) => match.led), whenEverTrailing: record((match) => match.trailed), whenLeadingByOne: record((match) => match.ledByOne), whenTrailingByOne: record((match) => match.trailedByOne) },
    matches
  };
}
function summarizeTeamSeasonProfile(data, teamId) {
  const profiles = (data.overview?.table ?? []).flatMap((entry) => entry.data?.tables ?? []).map((table) => {
    const standing = table.table?.all?.find((row) => Number(row.id) === teamId);
    const expected = table.table?.xg?.find((row) => Number(row.id ?? row.teamId) === teamId);
    if (!standing && !expected || (standing?.played ?? expected?.played ?? 0) === 0) return null;
    return {
      competition: table.leagueName,
      leagueId: table.leagueId,
      standing: standing ? {
        position: standing.idx,
        played: standing.played,
        wins: standing.wins,
        draws: standing.draws,
        losses: standing.losses,
        goals: standing.scoresStr,
        goalDifference: standing.goalConDiff,
        points: standing.pts
      } : null,
      expectedPerformance: expected ? {
        xg: expected.xg,
        xgConceded: expected.xgConceded,
        expectedGoalDifference: expected.xg === void 0 || expected.xgConceded === void 0 ? void 0 : expected.xg - expected.xgConceded,
        goalsVsXg: expected.xgDiff,
        goalsConcededVsXga: expected.xgConcededDiff,
        expectedPoints: expected.xPoints,
        expectedPosition: expected.xPosition
      } : null
    };
  }).filter(Boolean);
  return {
    team: { id: teamId, name: data.details?.name, fifaRanking: data.details?.fifaRanking?.rank, fifaPoints: data.details?.fifaRanking?.points },
    seasons: profiles
  };
}
export {
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
  summarizeTeamSeasonProfile
};
