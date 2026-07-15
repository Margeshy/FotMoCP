# FotMoCP

I built FotMoCP so an MCP client can check live FotMob data before analyzing a football match. Its ten read-only tools cover match stats, team form, injuries, and player workload. It does not make predictions.

## What you need

- Node.js 22 or newer
- Internet access to `www.fotmob.com`

## Run it

FotMoCP only uses modules included with Node.js, so there is nothing to install from npm.

```bash
npm run check
npm start
```

`npm run check` runs the tests and builds `dist/`. Use `npm run build` when you only want to rebuild the runtime files.

## Add it to an MCP client

```json
{
  "mcpServers": {
    "fotmob": {
      "command": "node",
      "args": ["/absolute/path/to/FotMoCP/dist/index.js"],
      "cwd": "/absolute/path/to/FotMoCP"
    }
  }
}
```

On Windows, use escaped backslashes:

```json
{
  "mcpServers": {
    "fotmob": {
      "command": "node",
      "args": ["C:\\Users\\your-name\\FotMoCP\\dist\\index.js"],
      "cwd": "C:\\Users\\your-name\\FotMoCP"
    }
  }
}
```

## Tools

| Tool | Data returned |
| --- | --- |
| `search_fotmob(query)` | Team, player, league, and match IDs |
| `find_matches(date)` | Match IDs and scores for `YYYY-MM-DD` |
| `get_match_stats(matchId)` | Score, team stats, and player stats; accepts an ID or FotMob URL |
| `get_match_prediction_context(matchId)` | Clock, events, lineups, momentum, form, venue, and weather; accepts an ID or FotMob URL |
| `get_goalkeeper_match_stats(matchId)` | Saves, save percentage, xGOT faced, and goals prevented; accepts an ID or FotMob URL |
| `get_team_form(teamId, limit?)` | Recent results, home/away splits, ranking, and per-match xG |
| `get_team_season_profile(teamId)` | Table record, xG, xGA, xPoints, and FIFA ranking |
| `get_team_availability(teamId)` | Reported injuries and return dates |
| `get_team_game_state_record(teamId, limit?)` | Results after leading or trailing |
| `get_player_workload(playerId)` | Recent minutes, last match, and injury status |

## Limits

FotMob does not document these site endpoints as a public API, so they may change without notice. FotMoCP only makes GET requests and does not cache or save responses.
