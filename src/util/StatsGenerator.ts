import { Match } from "../model/Match";

export function generateStatsForMatch(match: Match): any {
  const matchObj = match as any;
  const teams = matchObj.teams || [];
  const team0 = teams[0];
  const team1 = teams[1];

  const team0Players = team0?.players || [];
  const team1Players = team1?.players || [];

  if (team0Players.length === 0 && team1Players.length === 0) {
    return null;
  }

  const team0RoundsWon = typeof team0?.roundsWon === "number" ? team0.roundsWon : 0;
  const team1RoundsWon = typeof team1?.roundsWon === "number" ? team1.roundsWon : 0;
  const roundsPlayed = Math.max(1, team0RoundsWon + team1RoundsWon);

  let mapName = matchObj.map;
  if (!mapName || mapName === "Loading" || mapName === "Null" || mapName === "Unknown" || mapName === "") {
    mapName = "Ascent";
  }

  const formatPlayer = (player: any, teamId: "Blue" | "Red", defaultIndex: number = 0) => {
    const playerName = player?.name || (typeof player?.getName === "function" ? player.getName() : `${teamId} ${defaultIndex + 1}`);
    const playerTag = player?.tagline || (teamId === "Blue" ? (team0?.teamTricode || "LFT") : (team1?.teamTricode || "RGT"));
    const playerId = player?.riotId || (typeof player?.getPlayerId === "function" ? player.getPlayerId() : `${playerName}-${teamId}`);

    const agentName = player?.agentProper || player?.agentInternal || "Jett";
    const agentInternal = player?.agentInternal || (typeof player?.getAgentInternal === "function" ? player.getAgentInternal() : "Wushu");

    const kills = typeof player?.kills === "number" ? player.kills : 0;
    const deaths = typeof player?.deaths === "number" ? player.deaths : 0;
    const assists = typeof player?.assists === "number" ? player.assists : 0;
    const killsThisRound = typeof player?.killsThisRound === "number" ? player.killsThisRound : 0;

    const score = kills * 200 + assists * 50 + killsThisRound * 50;
    const acs = Math.round(score / roundsPlayed);
    const moneySpent = Number(player?.moneySpent) || roundsPlayed * 3300;

    const headshots = Number(player?.headshotKills) || Math.round(kills * 0.3);
    const bodyshots = Math.round(kills * 0.6);
    const legshots = Math.round(kills * 0.1);

    const grenadeCasts = Math.max(1, Math.round(roundsPlayed * 0.8));
    const ability1Casts = Math.max(1, Math.round(roundsPlayed * 0.9));
    const ability2Casts = Math.max(1, Math.round(roundsPlayed * 0.7));
    const ultCasts = Math.max(1, Math.round(roundsPlayed * 0.25));

    return {
      puuid: playerId,
      name: playerName,
      tag: playerTag,
      team_id: teamId,
      platform: "pc",
      party_id: "",
      agent: {
        id: agentInternal,
        name: agentName,
      },
      stats: {
        score: score,
        acs: acs,
        kills: Math.max(0, kills),
        firstKills: defaultIndex === 0 ? Math.max(1, Math.round(kills * 0.2)) : 0,
        deaths: Math.max(0, deaths),
        assists: Math.max(0, assists),
        headshots: headshots,
        bodyshots: bodyshots,
        legshots: legshots,
        damage: {
          dealt: kills * 145 + assists * 40,
          received: deaths * 140,
        },
      },
      ability_casts: {
        grenade: grenadeCasts,
        ability1: ability1Casts,
        ability2: ability2Casts,
        ultimate: ultCasts,
      },
      tier: {
        id: 0,
        name: null,
      },
      card_id: "",
      title_id: "",
      prefered_level_border: null,
      account_level: 100,
      session_playtime_in_ms: 0,
      behavior: {
        afk_rounds: 0,
        friendly_fire: {
          incoming: 0,
          outgoing: 0,
        },
        rounds_in_spawn: 0,
      },
      economy: {
        spent: {
          overall: moneySpent,
          average: Math.round(moneySpent / roundsPlayed),
        },
        loadout_value: {
          overall: 0,
          average: 0,
        },
      },
    };
  };

  const players: any[] = [];
  team0Players.forEach((p: any, idx: number) => {
    players.push(formatPlayer(p, "Blue", idx));
  });

  team1Players.forEach((p: any, idx: number) => {
    players.push(formatPlayer(p, "Red", idx));
  });

  // Sort players by score descending
  players.sort((a, b) => b.stats.score - a.stats.score);

  // Generate rounds record
  const rounds: any[] = [];
  const roundRecord = team0?.roundRecord || [];
  for (let i = 0; i < roundsPlayed; i++) {
    const rec = roundRecord[i];
    let result = "Elimination";
    if (rec?.type === "defused") result = "Defuse";
    else if (rec?.type === "detonated") result = "Detonate";
    else if (rec?.type === "timeout") result = "";

    const wonByTeam0 = rec?.type !== "lost" && rec?.type !== "upcoming" && rec?.type != null;
    const winningTeam = wonByTeam0 ? "Blue" : "Red";

    rounds.push({
      id: i + 1,
      result: result,
      ceremony: "CeremonyDefault",
      winning_team: winningTeam,
      plant: null,
      defuse: null,
      stats: [],
    });
  }

  return {
    metadata: {
      match_id: matchObj.matchId || `local-${matchObj.groupCode}`,
      map: {
        id: mapName,
        name: mapName,
      },
      game_version: "local",
      game_length_in_ms: roundsPlayed * 100 * 1000,
      started_at: new Date().toISOString(),
      is_completed: true,
      queue: {
        id: "custom",
        name: "Custom",
        mode_type: "Standard",
      },
      season: {
        id: "",
        short: null,
      },
      platform: "pc",
      premier_info: {
        matchup_id: null,
        podium_id: null,
      },
      region: "eu",
      cluster: "Paris",
    },
    teams: [
      {
        team_id: "Blue",
        rounds: {
          won: team0RoundsWon,
          lost: team1RoundsWon,
        },
        won: team0RoundsWon > team1RoundsWon,
        premier_roster: null,
        name: team0?.teamName || "Team 1",
        tricode: team0?.teamTricode || "TM1",
        url: team0?.teamUrl || "",
      },
      {
        team_id: "Red",
        rounds: {
          won: team1RoundsWon,
          lost: team0RoundsWon,
        },
        won: team1RoundsWon > team0RoundsWon,
        premier_roster: null,
        name: team1?.teamName || "Team 2",
        tricode: team1?.teamTricode || "TM2",
        url: team1?.teamUrl || "",
      },
    ],
    players: players,
    rounds: rounds,
  };
}
