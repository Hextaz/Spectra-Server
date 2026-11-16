import { DatabaseConnector } from "../connector/databaseConnector";
import { AuthTeam, WebsocketIncoming } from "../connector/websocketIncoming";
import { WebsocketOutgoing } from "../connector/websocketOutgoing";
import { Match } from "../model/Match";
import { IAuthedAuxData, IAuthedData, IAuthenticationData } from "../model/eventData";
import { ITournamentInfo, ISponsorInfo } from "../model/ToolsData";
import logging from "../util/Logging";
import { generateStatsForMatch } from "../util/StatsGenerator";
const Log = logging("MatchController");

export class MatchController {
  private static instance: MatchController;
  private outgoingWebsocketServer: WebsocketOutgoing = WebsocketOutgoing.getInstance();
  private sendInterval: NodeJS.Timeout | null = null;

  private matches: Record<string, Match> = {};
  private eventNumbers: Record<string, number> = {};
  private eventTimes: Record<string, number> = {};

  private codeToTeamInfo: Record<string, { leftTeam: AuthTeam; rightTeam: AuthTeam }> = {};
  private finishedGamesTeamInfo: Record<
    string,
    {
      leftTeam: AuthTeam;
      rightTeam: AuthTeam;
      higherScore: 0 | 1;
      tournamentInfo: ITournamentInfo;
      sponsorInfo: ISponsorInfo;
      isSupporter: boolean;
    }
  > = {};
  private finishedGamesStats: Record<string, any> = {};
  private teamInfoExpiry: Record<string, number> = {};

  private constructor() {
    const cleanupInterval = setInterval(
      () => {
        const now = Date.now();
        for (const groupCode in this.teamInfoExpiry) {
          if (now > this.teamInfoExpiry[groupCode]) {
            delete this.finishedGamesTeamInfo[groupCode];
            delete this.finishedGamesStats[groupCode];
            delete this.teamInfoExpiry[groupCode];
          }
        }
      },
      1000 * 60 * 5,
    ); // Check every 5 minutes
    cleanupInterval.unref();
  }

  public static getInstance(): MatchController {
    if (MatchController.instance == null) MatchController.instance = new MatchController();
    return MatchController.instance;
  }

  async createMatch(data: IAuthenticationData) {
    try {
      const existingMatch = this.matches[data.groupCode];
      if (existingMatch != null) {
        if (data.groupSecret && data.groupSecret === existingMatch.groupSecret) {
          Log.info(
            `Match with group code ${data.groupCode} already exists and secret was correct, reconnected.`,
          );
          return existingMatch.groupSecret;
        }
        Log.info(`Refreshing match for group code ${data.groupCode}`);
      }
      const newMatch = new Match(data);

      this.matches[data.groupCode] = newMatch;
      this.eventNumbers[data.groupCode] = 0;

      this.codeToTeamInfo[data.groupCode] = {
        leftTeam: data.leftTeam,
        rightTeam: data.rightTeam,
      };
      this.teamInfoExpiry[data.groupCode] = Date.now() + 1000 * 60 * 60 * 12; // 12 hour expiry for team info

      Log.info(`New match "${newMatch.groupCode}" registered!`);
      this.startOutgoingSendLoop();
      return newMatch.groupSecret;
    } catch (e) {
      Log.info(`Failed to create match with group code ${data.groupCode}, ${e}`);
      return "";
    }
  }

  findMatch(matchId: string) {
    return Object.values(this.matches).find((match) => match.matchId == matchId)?.groupCode ?? null;
  }

  removeMatch(groupCode: string) {
    if (this.matches[groupCode] != null) {
      delete this.matches[groupCode];
      delete this.eventNumbers[groupCode];
      WebsocketIncoming.disconnectGroupCode(groupCode);
      Log.info(`Deleted match with group code ${groupCode}`);
      if (Object.keys(this.matches).length == 0 && this.sendInterval != null) {
        clearInterval(this.sendInterval);
        this.sendInterval = null;
        Log.info(`Last match concluded, send loop stopped`);
      }
    }
  }

  getMatchCount() {
    return Object.keys(this.matches).length;
  }

  async receiveMatchData(data: IAuthedData | IAuthedAuxData) {
    data.timestamp = Date.now();

    if ("groupCode" in data) {
      const trackedMatch = this.matches[data.groupCode];
      if (trackedMatch == null) {
        // How did we even get here?
        Log.info(`Received match data with invalid game "${data.groupCode}"`);
        return;
      }

      await trackedMatch.receiveMatchSpecificData(data);

      // Aux data handling, as it can be sent to multiple matches
    } else if ("matchId" in data) {
      for (const match of Object.values(this.matches)) {
        if (match.matchId == data.matchId) {
          await match.receiveMatchSpecificData(data);
        }
      }
    }
  }

  async receiveAuxMatchData(data: IAuthedAuxData) {
    data.timestamp = Date.now();
    for (const match of Object.values(this.matches)) {
      if (match.matchId == data.matchId) {
        await match.receiveMatchSpecificData(data);
      }
    }
  }

  setAuxDisconnected(groupCode: string, playerId: string) {
    if (this.matches[groupCode] != null) {
      this.matches[groupCode].setAuxDisconnected(playerId);
    }
  }

  sendMatchDataForLogon(groupCode: string) {
    if (this.matches[groupCode] != null) {
      const {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        replayLog,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        eventNumber,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        timeoutEndTimeout,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        timeoutRemainingLoop,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        playercamUrl,
        ...formattedData
      } = this.matches[groupCode] as any;

      this.outgoingWebsocketServer.sendMatchData(groupCode, formattedData);
    }
  }

  private startOutgoingSendLoop() {
    if (this.sendInterval != null) {
      Log.info(`Match registered with active send loop, skipping start`);
      return;
    }
    Log.info(`Match registered without active send loop, send loop started`);
    this.sendInterval = setInterval(async () => {
      for (const groupCode in this.matches) {
        if (this.matches[groupCode].eventNumber > this.eventNumbers[groupCode]) {
          this.outgoingWebsocketServer.sendMatchData(groupCode, this.matches[groupCode]);
          this.eventNumbers[groupCode] = this.matches[groupCode].eventNumber;
          this.eventTimes[groupCode] = Date.now();
        } else {
          // Check if the last event was more than 30 minutes ago
          if (Date.now() - this.eventTimes[groupCode] > 1000 * 60 * 30) {
            Log.info(
              `Match with group code ${groupCode} has been inactive for more than 30 minutes, removing.`,
            );

            try {
              if (this.matches[groupCode].isRegistered) {
                await DatabaseConnector.completeMatch(this.matches[groupCode]);
              }
            } catch (e) {
              Log.error(`Failed to complete match in backend with group code ${groupCode}, ${e}`);
            }

            this.removeMatch(groupCode);
          }
        }
      }
    }, 100);
  }

  public getTeamInfoForCode(groupCode: string) {
    const code = (groupCode || "").toUpperCase();
    const teamInfo = this.finishedGamesTeamInfo[code] || this.finishedGamesTeamInfo[groupCode];
    if (teamInfo) {
      return teamInfo;
    } else if (this.matches[code] || this.matches[groupCode]) {
      const match = this.matches[code] || this.matches[groupCode];
      return {
        leftTeam: match.teams[0] ? {
          name: match.teams[0].teamName,
          tricode: match.teams[0].teamTricode,
          url: match.teams[0].teamUrl,
          attackStart: match.teams[0].isAttacking,
        } : (this.codeToTeamInfo[code]?.leftTeam || this.codeToTeamInfo[groupCode]?.leftTeam),
        rightTeam: match.teams[1] ? {
          name: match.teams[1].teamName,
          tricode: match.teams[1].teamTricode,
          url: match.teams[1].teamUrl,
          attackStart: match.teams[1].isAttacking,
        } : (this.codeToTeamInfo[code]?.rightTeam || this.codeToTeamInfo[groupCode]?.rightTeam),
        higherScore: (match.teams[0]?.roundsWon || 0) >= (match.teams[1]?.roundsWon || 0) ? 0 : 1,
        tournamentInfo: match.tools?.tournamentInfo || { name: "", logo: "", isEnabled: false },
        sponsorInfo: match.tools?.sponsorInfo || { sponsors: [], isEnabled: false },
        isSupporter: true,
      };
    } else if (this.codeToTeamInfo[code] || this.codeToTeamInfo[groupCode]) {
      const info = this.codeToTeamInfo[code] || this.codeToTeamInfo[groupCode];
      return {
        leftTeam: info.leftTeam,
        rightTeam: info.rightTeam,
        higherScore: 0,
        tournamentInfo: { name: "", logo: "", isEnabled: false },
        sponsorInfo: { sponsors: [], isEnabled: false },
        isSupporter: true,
      };
    } else {
      return {
        leftTeam: { name: "Gentle Mates", tricode: "M8", url: "", attackStart: true },
        rightTeam: { name: "Karmine Corp", tricode: "KC", url: "", attackStart: false },
        higherScore: 0,
        tournamentInfo: { name: "", logo: "", isEnabled: false },
        sponsorInfo: { sponsors: [], isEnabled: false },
        isSupporter: true,
      };
    }
  }

  public getStatsForCode(groupCode: string) {
    const code = (groupCode || "").toUpperCase();
    if (this.finishedGamesStats[code]) {
      return this.finishedGamesStats[code];
    } else if (this.finishedGamesStats[groupCode]) {
      return this.finishedGamesStats[groupCode];
    } else if (this.matches[code]) {
      const stats = generateStatsForMatch(this.matches[code]);
      if (stats) return stats;
    } else if (this.matches[groupCode]) {
      const stats = generateStatsForMatch(this.matches[groupCode]);
      if (stats) return stats;
    }
    return undefined;
  }

  public setWinningTeamInfo(
    groupCode: string,
    higherScoreTeam: 0 | 1,
    sponsorInfo: ISponsorInfo,
    tournamentInfo: ITournamentInfo,
    isSupporter: boolean,
  ) {
    if (this.matches[groupCode]) {
      this.finishedGamesStats[groupCode] = generateStatsForMatch(this.matches[groupCode]);
    }

    this.finishedGamesTeamInfo[groupCode] = {
      leftTeam: this.codeToTeamInfo[groupCode]?.leftTeam || {
        name: this.matches[groupCode]?.teams[0]?.teamName || "Left Team",
        tricode: this.matches[groupCode]?.teams[0]?.teamTricode || "LFT",
        url: this.matches[groupCode]?.teams[0]?.teamUrl || "",
        attackStart: true,
      },
      rightTeam: this.codeToTeamInfo[groupCode]?.rightTeam || {
        name: this.matches[groupCode]?.teams[1]?.teamName || "Right Team",
        tricode: this.matches[groupCode]?.teams[1]?.teamTricode || "RGT",
        url: this.matches[groupCode]?.teams[1]?.teamUrl || "",
        attackStart: false,
      },
      higherScore: higherScoreTeam,
      tournamentInfo: tournamentInfo,
      sponsorInfo: sponsorInfo,
      isSupporter: isSupporter,
    };
  }
}
