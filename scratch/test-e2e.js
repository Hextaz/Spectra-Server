const { io: ioClient } = require("socket.io-client");

async function testE2E() {
  console.log("=== Testing E2E Pipeline ===");
  
  // 1. Frontend Socket
  const frontendSocket = ioClient("http://localhost:5200", { transports: ["websocket"] });
  
  frontendSocket.on("connect", () => {
    console.log("1. Frontend connected to port 5200");
    frontendSocket.emit("logon", JSON.stringify({ groupCode: "E2ETEST" }));
  });

  frontendSocket.on("logon_success", (msg) => {
    console.log("2. Frontend logon_success received:", msg);
  });

  frontendSocket.on("match_data", (data) => {
    const parsed = JSON.parse(data);
    console.log("5. Frontend received match_data successfully!", {
      groupCode: parsed.groupCode,
      teams: parsed.teams?.map(t => t.teamName),
      roundNumber: parsed.roundNumber,
      map: parsed.map
    });
    frontendSocket.disconnect();
    clientSocket.disconnect();
    console.log("=== E2E TEST PASSED SUCCESSFULLY! ===");
    process.exit(0);
  });

  // 2. Client Socket
  const clientSocket = ioClient("http://localhost:5100", { transports: ["websocket"] });
  
  clientSocket.on("connect", () => {
    console.log("3. Client connected to port 5100");
    
    // Auth packet
    const authData = {
      type: "authenticate",
      clientVersion: "0.3.4",
      obsName: "Observer1",
      groupCode: "E2ETEST",
      key: "",
      leftTeam: { name: "Team Blue", tricode: "BLU", url: "", attackStart: true },
      rightTeam: { name: "Team Red", tricode: "RED", url: "", attackStart: false },
      toolsData: {}
    };
    
    clientSocket.emit("obs_logon", JSON.stringify(authData));
  });

  clientSocket.on("obs_logon_ack", (msg) => {
    const ack = JSON.parse(msg);
    console.log("4. Client obs_logon_ack received:", ack);
  });
}

testE2E();
