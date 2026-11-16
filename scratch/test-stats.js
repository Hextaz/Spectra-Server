const { io: ioClient } = require("socket.io-client");

async function testStats() {
  console.log("=== Testing Local Stats Endpoint with Gekko ===");
  
  const clientSocket = ioClient("http://localhost:5100", { transports: ["websocket"] });
  
  clientSocket.on("connect", () => {
    console.log("1. Client connected to 5100, sending auth...");
    const authData = {
      type: "authenticate",
      clientVersion: "0.3.4",
      obsName: "Observer1",
      groupCode: "STATSTEST2",
      key: "",
      leftTeam: { name: "Gentle Mates", tricode: "M8", url: "https://example.com/m8.png", attackStart: true },
      rightTeam: { name: "Karmine Corp", tricode: "KC", url: "https://example.com/kc.png", attackStart: false },
      toolsData: {}
    };
    clientSocket.emit("obs_logon", JSON.stringify(authData));
  });

  clientSocket.on("obs_logon_ack", async (msg) => {
    const ack = JSON.parse(msg);
    console.log("2. Logon ack:", ack.value);

    // Send score update
    const scorePacket = {
      obsName: "Observer1",
      type: "score",
      groupCode: "STATSTEST2",
      groupSecret: ack.reason,
      data: { team_0: 13, team_1: 9 }
    };
    clientSocket.emit("obs_data", JSON.stringify(scorePacket));

    // Send roster with Gekko (Aggrobot_PC_C)
    const p1 = {
      obsName: "Observer1",
      type: "roster",
      groupCode: "STATSTEST2",
      groupSecret: ack.reason,
      data: {
        name: "nataNk",
        tagline: "M8",
        startTeam: 0,
        agentInternal: "Aggrobot_PC_C",
        playerId: "puuid-natank",
        position: 1,
        locked: true,
        rank: 25
      }
    };
    clientSocket.emit("obs_data", JSON.stringify(p1));

    const p1Scoreboard = {
      obsName: "Observer1",
      type: "scoreboard",
      groupCode: "STATSTEST2",
      groupSecret: ack.reason,
      data: {
        name: "nataNk",
        tagline: "M8",
        playerId: "puuid-natank",
        startTeam: 0,
        agentInternal: "Aggrobot_PC_C",
        isAlive: true,
        initialArmor: 2,
        scoreboardWeaponInternal: "TX_Weapon_Assault_Rifle_Vandal",
        currUltPoints: 7,
        maxUltPoints: 7,
        hasSpike: false,
        money: 4500,
        kills: 22,
        deaths: 10,
        assists: 8
      }
    };
    clientSocket.emit("obs_data", JSON.stringify(p1Scoreboard));

    setTimeout(async () => {
      console.log("3. Fetching /getStats from server port 5101...");
      const resStats = await fetch("http://localhost:5101/getStats?code=STATSTEST2");
      const statsJson = await resStats.json();
      console.log("4. /getStats response status:", resStats.status);
      console.log("   Teams:", statsJson.data?.teams?.map(t => `${t.name} (${t.rounds.won})`));
      console.log("   Players:", statsJson.data?.players?.map(p => `${p.name} [${p.agent.name}] KDA: ${p.stats.kills}/${p.stats.deaths}/${p.stats.assists} ACS: ${p.stats.acs}`));

      clientSocket.disconnect();
      console.log("=== STATS GEKKO TEST PASSED! ===");
      process.exit(0);
    }, 1000);
  });
}

testStats();
