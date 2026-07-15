# FotMob MCP

A zero-dependency stdio MCP server that gives agents FotMob match, team, and player data for football analysis.

## Requirements

- Node.js 22 or newer
- Internet access to `www.fotmob.com`

## Build and run

No package installation is required. The project uses only Node.js built-ins.

```bash
npm run check
npm run build
npm start
```

`npm run build` validates the JavaScript and copies the two runtime files into `dist/`. It does not install packages.

## MCP configuration

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
| `search_fotmob(query)` | Compact team, player, league, and match IDs |
| `find_matches(date)` | Match IDs and scores for `YYYY-MM-DD` |
| `get_match_stats(matchId)` | Deduplicated team and active-player stats; accepts an ID or FotMob URL |
| `get_match_prediction_context(matchId)` | Clock, events, lineups, momentum, form, venue, weather, and competition context; accepts an ID or FotMob URL |
| `get_goalkeeper_match_stats(matchId)` | Saves, save percentage, xGOT faced, and goals prevented; accepts an ID or FotMob URL |
| `get_team_form(teamId, limit?)` | Recent results, home/away splits, ranking, and available xG |
| `get_team_season_profile(teamId)` | Table record, xG/xGA/xPoints, and FIFA ranking where available |
| `get_team_availability(teamId)` | FotMob-reported injuries and expected returns |
| `get_team_game_state_record(teamId, limit?)` | Results after leading or trailing |
| `get_player_workload(playerId)` | Recent minutes, last match, and injury status |

FotMob's endpoints are unofficial and may change. This server makes read-only requests and does not store FotMob data.
