require("dotenv").config();
import { Server } from "socket.io";
import logging from "../util/Logging";
import { readFileSync } from "fs";
import { createServer } from "https";
import { createServer as createInsecureServer } from "http";
import { MatchController } from "../controller/MatchController";
const Log = logging("WebsocketOutgoing");

export class WebsocketOutgoing {
  private static instance: WebsocketOutgoing;
  wss: Server;
  private mapbanSessions = new Set<string>();
  private lastMapbanState = new Map<string, string>();

  public static getInstance(): WebsocketOutgoing {
    if (WebsocketOutgoing.instance == null) WebsocketOutgoing.instance = new WebsocketOutgoing();
    return WebsocketOutgoing.instance;
  }

  constructor() {
    let serverInstance;

    if (process.env.INSECURE == "true") {
      serverInstance = createInsecureServer();
    } else {
      if (!process.env.SERVER_KEY || !process.env.SERVER_CERT) {
        Log.error(
          `Missing TLS key or certificate! Please provide the paths to the key and certificate in the .env file. (SERVER_KEY and SERVER_CERT)`,
        );
      }

      const options = {
        key: readFileSync(process.env.SERVER_KEY!),
        cert: readFileSync(process.env.SERVER_CERT!),
      };

      serverInstance = createServer(options);
    }

    this.wss = new Server(serverInstance, {
      perMessageDeflate: {
        zlibDeflateOptions: {
          chunkSize: 1024,
          memLevel: 7,
          level: 3,
        },
        zlibInflateOptions: {
          chunkSize: 10 * 1024,
        },
        threshold: 1024,
      },
      cors: { origin: "*" },
    });

    this.wss.on(`connection`, (ws) => {
      ws.on("error", (e) => {
        Log.error(`Someone in ${ws.rooms} encountered a Websocket error: ${e}`);
      });

      ws.once("logon", (msg: string) => {
        try {
          const json = JSON.parse(msg);
          // Self-hosted mapban sessions: frontend /mapban?sessionId=<groupCode>
          if (json.sessionId && !json.groupCode) {
            const code = String(json.sessionId).toUpperCase();
            ws.join(`mapban:${code}`);
            this.mapbanSessions.add(code);
            this.lastMapbanState.delete(code);
            ws.emit("session_data", JSON.stringify(this.buildSessionData(code)));
            Log.info(`Mapban session logon for code ${code}`);
            return;
          }
          ws.join(json.groupCode);
          ws.emit(
            "logon_success",
            JSON.stringify({
              groupCode: json.groupCode,
              msg: `Logon succeeded for group code ${json.groupCode}`,
            }),
          );
          Log.info(`Received output logon using Group Code ${json.groupCode}`);
          MatchController.getInstance().sendMatchDataForLogon(json.groupCode);
        } catch (e) {
          Log.error(`Error parsing outgoing logon request: ${e}`);
        }
      });
    });

    this.wss.engine.on("connection_error", (err) => {
      Log.error("Socket.IO error: " + err);
    });

    serverInstance.listen(5200);

    Log.info(`Spectra Server outputting on port 5200!`);
  }

  sendMatchData(groupCode: string, data: any) {
    const {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      replayLog,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      eventNumber,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      groupSecret,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      playercamUrl,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      timeoutEndTimeout,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      timeoutRemainingLoop,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      toastEndTimeout,

      ...formattedData
    } = data;

    const deepMod: any = structuredClone(formattedData);
    if (
      deepMod.tools &&
      deepMod.tools.playercamsInfo &&
      typeof deepMod.tools.playercamsInfo === "object"
    ) {
      delete deepMod.tools.playercamsInfo.secret;
      delete deepMod.tools.playercamsInfo.endTime;
    }

    this.wss.to(groupCode).emit("match_data", JSON.stringify(deepMod));

    // Push mapban session updates when the map pool changes
    if (this.mapbanSessions.has(groupCode)) {
      const mapInfoJson = JSON.stringify((data as any)?.tools?.mapInfo ?? []);
      if (this.lastMapbanState.get(groupCode) !== mapInfoJson) {
        this.lastMapbanState.set(groupCode, mapInfoJson);
        this.wss
          .to(`mapban:${groupCode}`)
          .emit("session_data", JSON.stringify(this.buildSessionData(groupCode)));
      }
    }
  }

  private buildSessionData(groupCode: string) {
    const mapPool = [
      "Ascent", "Bind", "Breeze", "Fracture", "Haven", "Icebox",
      "Lotus", "Pearl", "Split", "Sunset", "Abyss", "Corrode", "Summit",
    ];
    const availableMaps = mapPool.map((name) => ({ name }));
    const match = MatchController.getInstance().getMatch(groupCode);
    if (!match) {
      return {
        sessionIdentifier: groupCode,
        organizationName: "Self-hosted",
        isSupporter: true,
        teams: [],
        format: undefined,
        availableMaps,
        selectedMaps: [],
        stage: "pick",
        actingTeamCode: "",
        actingTeam: 0,
      };
    }
    const teams: any[] = match.teams || [];
    const leftUrl: string = teams[0]?.teamUrl || "";
    const rightUrl: string = teams[1]?.teamUrl || "";
    const selectedMaps: any[] = [];
    for (const info of (match.tools?.mapInfo || []) as any[]) {
      if (info.type === "past" && info.map) {
        selectedMaps.push({ name: info.map, score: [info.left?.score ?? 0, info.right?.score ?? 0] });
      } else if (info.type === "future" && info.map) {
        const pickedBy =
          leftUrl && info.logo === leftUrl ? 0 : rightUrl && info.logo === rightUrl ? 1 : undefined;
        selectedMaps.push({ name: info.map, pickedBy });
      }
    }
    return {
      sessionIdentifier: groupCode,
      organizationName: "Self-hosted",
      isSupporter: true,
      teams: [
        { name: teams[0]?.teamName || "Left", tricode: teams[0]?.teamTricode || "LFT", url: leftUrl },
        { name: teams[1]?.teamName || "Right", tricode: teams[1]?.teamTricode || "RGT", url: rightUrl },
      ],
      format: undefined,
      availableMaps,
      selectedMaps,
      stage: "pick",
      actingTeamCode: teams[0]?.teamTricode || "LFT",
      actingTeam: 0,
    };
  }
}
