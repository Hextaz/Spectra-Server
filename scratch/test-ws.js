const { io: ioClient } = require("socket.io-client");

console.log("Connecting frontend-mock to port 5200...");
const frontendSocket = ioClient("http://localhost:5200", {
  transports: ["websocket"]
});

frontendSocket.on("connect", () => {
  console.log("[Mock Frontend] Connected to port 5200!");
  frontendSocket.emit("logon", JSON.stringify({ groupCode: "SHOWMATCH" }));
});

frontendSocket.on("logon_success", (msg) => {
  console.log("[Mock Frontend] Logon success:", msg);
});

frontendSocket.on("match_data", (data) => {
  console.log("[Mock Frontend] Received match_data! Length:", data.length);
  process.exit(0);
});

frontendSocket.on("connect_error", (err) => {
  console.error("[Mock Frontend] Connection error:", err.message);
  process.exit(1);
});

setTimeout(() => {
  console.log("[Mock Frontend] Timeout waiting for match_data, but connection was OK!");
  process.exit(0);
}, 3000);
