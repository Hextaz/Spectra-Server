const { io: ioClient } = require("socket.io-client");

async function simulateRealMatch() {
  console.log("=== Simulating Full Match with Real Players on SHOWMATCH ===");
  
  const clientSocket = ioClient("http://localhost:5100", { transports: ["websocket"] });
  
  clientSocket.on("connect", () => {
    console.log("1. Authenticating SHOWMATCH...");
    const authData = {
      type: "authenticate",
      clientVersion: "0.3.4",
      obsName: "Observer1",
      groupCode: "SHOWMATCH",
      key: "",
      leftTeam: { name: "Gentle Tkt", tricode: "M7", url: "", attackStart: true },
      rightTeam: { name: "Kk Team", tricode: "Kk", url: "", attackStart: false },
      toolsData: {}
    };
    clientSocket.emit("obs_logon", JSON.stringify(authData));
  });

  clientSocket.on("obs_logon_ack", async (msg) => {
    const ack = JSON.parse(msg);
    console.log("2. Logon acknowledged, Secret:", ack.reason);

    const groupSecret = ack.reason;

    // Send score update
    clientSocket.emit("obs_data", JSON.stringify({
      obsName: "Observer1",
      type: "score",
      groupCode: "SHOWMATCH",
      groupSecret: groupSecret,
      data: { team_0: 13, team_1: 11 }
    }));

    // Send map
    clientSocket.emit("obs_data", JSON.stringify({
      obsName: "Observer1",
      type: "map",
      groupCode: "SHOWMATCH",
      groupSecret: groupSecret,
      data: "Sunset"
    }));

    // Team 0 Players (Gentle Tkt)
    const team0Roster = [
      { name: "Hextaz", tagline: "M7", agent: "Aggrobot", kills: 24, deaths: 14, assists: 9 },
      { name: "Skyline", tagline: "M7", agent: "Wushu", kills: 20, deaths: 16, assists: 5 },
      { name: "Vortex", tagline: "M7", agent: "Breach", kills: 18, deaths: 15, assists: 11 },
      { name: "Shadow", tagline: "M7", agent: "Wraith", kills: 15, deaths: 14, assists: 8 },
      { name: "Cipher", tagline: "M7", agent: "Cypher", kills: 12, deaths: 13, assists: 6 }
    ];

    // Team 1 Players (Kk Team)
    const team1Roster = [
      { name: "Apex", tagline: "Kk", agent: "Clay", kills: 26, deaths: 17, assists: 4 },
      { name: "Nova", tagline: "Kk", agent: "Sova", kills: 19, deaths: 16, assists: 12 },
      { name: "Blaze", tagline: "Kk", agent: "Phoenix", kills: 16, deaths: 18, assists: 7 },
      { name: "ViperMain", tagline: "Kk", agent: "Pandemic", kills: 14, deaths: 19, assists: 5 },
      { name: "Ghost", tagline: "Kk", agent: "Stealth", kills: 11, deaths: 19, assists: 8 }
    ];

    team0Roster.forEach((p, idx) => {
      clientSocket.emit("obs_data", JSON.stringify({
        obsName: "Observer1",
        type: "roster",
        groupCode: "SHOWMATCH",
        groupSecret: groupSecret,
        data: { name: p.name, tagline: p.tagline, startTeam: 0, agentInternal: p.agent, playerId: `puuid-t0-${idx}`, position: idx + 1, locked: true, rank: 25 }
      }));
      clientSocket.emit("obs_data", JSON.stringify({
        obsName: "Observer1",
        type: "scoreboard",
        groupCode: "SHOWMATCH",
        groupSecret: groupSecret,
        data: { name: p.name, tagline: p.tagline, playerId: `puuid-t0-${idx}`, startTeam: 0, agentInternal: p.agent, isAlive: true, initialArmor: 2, scoreboardWeaponInternal: "TX_Weapon_Assault_Rifle_Vandal", currUltPoints: 7, maxUltPoints: 7, hasSpike: false, money: 4500, kills: p.kills, deaths: p.deaths, assists: p.assists }
      }));
    });

    team1Roster.forEach((p, idx) => {
      clientSocket.emit("obs_data", JSON.stringify({
        obsName: "Observer1",
        type: "roster",
        groupCode: "SHOWMATCH",
        groupSecret: groupSecret,
        data: { name: p.name, tagline: p.tagline, startTeam: 1, agentInternal: p.agent, playerId: `puuid-t1-${idx}`, position: idx + 1, locked: true, rank: 25 }
      }));
      clientSocket.emit("obs_data", JSON.stringify({
        obsName: "Observer1",
        type: "scoreboard",
        groupCode: "SHOWMATCH",
        groupSecret: groupSecret,
        data: { name: p.name, tagline: p.tagline, playerId: `puuid-t1-${idx}`, startTeam: 1, agentInternal: p.agent, isAlive: true, initialArmor: 2, scoreboardWeaponInternal: "TX_Weapon_Assault_Rifle_Vandal", currUltPoints: 7, maxUltPoints: 7, hasSpike: false, money: 4500, kills: p.kills, deaths: p.deaths, assists: p.assists }
      }));
    });

    // Send game_end round info
    clientSocket.emit("obs_data", JSON.stringify({
      obsName: "Observer1",
      type: "round_info",
      groupCode: "SHOWMATCH",
      groupSecret: groupSecret,
      data: { roundNumber: 24, roundPhase: "game_end" }
    }));

    setTimeout(async () => {
      console.log("3. Fetching /getStats?code=SHOWMATCH...");
      const res = await fetch("http://localhost:5101/getStats?code=SHOWMATCH");
      const json = await res.json();
      console.log("   Status:", res.status);
      console.log("   Map:", json.data?.metadata?.map?.name);
      console.log("   Score:", json.data?.teams?.map(t => `${t.name}: ${t.rounds.won}`).join(" vs "));
      console.log("   Players:", json.data?.players?.map(p => `${p.name} (${p.agent.name}) - KDA: ${p.stats.kills}/${p.stats.deaths}/${p.stats.assists} ACS: ${p.stats.acs}`));

      clientSocket.disconnect();
      console.log("=== TEST FINISHED SUCCESSFULLY ===");
      process.exit(0);
    }, 1500);
  });
}

simulateRealMatch();
