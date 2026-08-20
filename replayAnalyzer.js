// replayAnalyzer.js
//
// Lux AI Season 1 Viewer の MainScene.frames を解析するためのクラス
//
// 使い方:
// const analyzer = new ReplayAnalyzer(scene);
// const result = analyzer.analyze();
// console.log(result);

class ReplayAnalyzer {
    constructor(scene) {
        if (!scene) {
            throw new Error("ReplayAnalyzer: scene が指定されていません。");
        }

        this.scene = scene;
        this.frames = scene.frames ?? [];
        this.accumulatedStats = scene.accumulatedStats ?? [];
    }

    /**
     * 指定チームのFrameを取得
     */
    getTeamState(frameIndex, team) {
        const frame = this.frames[frameIndex];

        if (!frame) {
            return null;
        }

        return frame.teamStates?.[team] ?? null;
    }

    /**
     * 累積資源採取量を取得
     *
     * resource:
     * "wood"
     * "coal"
     * "uranium"
     */
    getCollectedResource(frameIndex, team, resource) {
        const teamState = this.getTeamState(frameIndex, team);

        return (
            teamState
                ?.statistics
                ?.resourcesCollected
                ?.[resource] ?? 0
        );
    }

    /**
     * 初めて指定資源を採取したターンを取得
     *
     * 注意:
     * frames[n] は Turn n の処理前の状態。
     *
     * したがって
     *
     * frames[40].coal = 0
     * frames[41].coal = 20
     *
     * なら、石炭を採取したのは Turn 40。
     */
    getFirstResourceCollection(team, resource) {
        for (let frameIndex = 1; frameIndex < this.frames.length; frameIndex++) {
            const previousAmount = this.getCollectedResource(
                frameIndex - 1,
                team,
                resource
            );

            const currentAmount = this.getCollectedResource(
                frameIndex,
                team,
                resource
            );

            if (currentAmount > previousAmount) {
                return {
                    turn: frameIndex - 1,
                    observedFrame: frameIndex,

                    amount: currentAmount - previousAmount,
                    totalAmount: currentAmount,
                };
            }
        }

        return null;
    }

    getFirstWoodCollection(team) {
        return this.getFirstResourceCollection(team, "wood");
    }

    getFirstCoalCollection(team) {
        return this.getFirstResourceCollection(team, "coal");
    }

    getFirstUraniumCollection(team) {
        return this.getFirstResourceCollection(team, "uranium");
    }

    /**
     * 研究ポイントが初めて指定値以上になったターン
     */
    getResearchReachedTurn(team, requiredPoints) {
        for (let frameIndex = 1; frameIndex < this.frames.length; frameIndex++) {
            const previous =
                this.getTeamState(frameIndex - 1, team)?.researchPoints ?? 0;

            const current =
                this.getTeamState(frameIndex, team)?.researchPoints ?? 0;

            if (previous < requiredPoints && current >= requiredPoints) {
                return {
                    turn: frameIndex - 1,
                    observedFrame: frameIndex,
                    researchPoints: current,
                };
            }
        }

        return null;
    }

    /**
     * Lux Season 1
     *
     * Coal:    50 RP
     * Uranium: 200 RP
     */
    getCoalResearchTurn(team) {
        return this.getResearchReachedTurn(team, 50);
    }

    getUraniumResearchTurn(team) {
        return this.getResearchReachedTurn(team, 200);
    }

    /**
     * City Tile 数
     */
    getCityTileCount(frameIndex, team) {
        const frame = this.frames[frameIndex];

        if (!frame) {
            return 0;
        }

        return frame.cityTileData.filter(
            cityTile => cityTile.team === team
        ).length;
    }

    /**
     * City Tile が初めて増加したターン
     *
     * 初期Cityは除外する。
     */
    getFirstCityBuiltTurn(team) {
        for (let frameIndex = 1; frameIndex < this.frames.length; frameIndex++) {
            const previous = this.getCityTileCount(
                frameIndex - 1,
                team
            );

            const current = this.getCityTileCount(
                frameIndex,
                team
            );

            if (current > previous) {
                return {
                    turn: frameIndex - 1,
                    observedFrame: frameIndex,
                    added: current - previous,
                    total: current,
                };
            }
        }

        return null;
    }

    /**
     * Worker数を取得
     */
    getWorkerCount(frameIndex, team) {
        return (
            this.getTeamState(frameIndex, team)?.workers ?? 0
        );
    }

    /**
     * Worker数が最大だった値と最初のターン
     */
    getMaxWorkers(team) {
        let maxWorkers = -1;
        let frameIndex = null;

        for (let i = 0; i < this.frames.length; i++) {
            const workers = this.getWorkerCount(i, team);

            if (workers > maxWorkers) {
                maxWorkers = workers;
                frameIndex = i;
            }
        }

        if (frameIndex === null) {
            return null;
        }

        return {
            turn: frameIndex,
            workers: maxWorkers,
        };
    }

    /**
     * 1チーム分まとめて解析
     */
    analyzeTeam(team) {
        return {
            team,

            firstWoodCollection:
                this.getFirstWoodCollection(team),

            coalResearch:
                this.getCoalResearchTurn(team),

            firstCoalCollection:
                this.getFirstCoalCollection(team),

            uraniumResearch:
                this.getUraniumResearchTurn(team),

            firstUraniumCollection:
                this.getFirstUraniumCollection(team),

            firstCityBuilt:
                this.getFirstCityBuiltTurn(team),

            maxWorkers:
                this.getMaxWorkers(team),
        };
    }

    /**
     * リプレイ全体を解析
     */
    analyze() {
        return {
            totalFrames: this.frames.length,

            teams: {
                0: this.analyzeTeam(0),
                1: this.analyzeTeam(1),
            },
        };
    }
}


/**
 * 解析結果を画面右上に表示
 */
function renderReplayAnalysis(result) {
    let panel = document.getElementById("replay-analysis-panel");

    if (!panel) {
        panel = document.createElement("div");
        panel.id = "replay-analysis-panel";

        Object.assign(panel.style, {
            position: "fixed",
            top: "60px",
            right: "20px",

            width: "300px",

            padding: "16px",

            background: "rgba(0, 0, 0, 0.80)",
            color: "white",

            fontFamily: "monospace",
            fontSize: "13px",

            borderRadius: "10px",

            zIndex: "99999",

            maxHeight: "80vh",
            overflowY: "auto",
        });

        document.body.appendChild(panel);
    }

    const formatTurn = (event) => {
        if (!event) {
            return "-";
        }

        return `Turn ${event.turn}`;
    };

    const createTeamHTML = (teamResult) => {
        return `
            <div style="margin-bottom: 18px;">
                <h3 style="margin-bottom: 8px;">
                    Team ${teamResult.team}
                </h3>

                <div>
                    最初の木材採取:
                    ${formatTurn(teamResult.firstWoodCollection)}
                </div>

                <div>
                    石炭研究:
                    ${formatTurn(teamResult.coalResearch)}
                </div>

                <div>
                    最初の石炭採取:
                    ${formatTurn(teamResult.firstCoalCollection)}
                </div>

                <div>
                    ウラン研究:
                    ${formatTurn(teamResult.uraniumResearch)}
                </div>

                <div>
                    最初のウラン採取:
                    ${formatTurn(teamResult.firstUraniumCollection)}
                </div>

                <div>
                    最初のCity建設:
                    ${formatTurn(teamResult.firstCityBuilt)}
                </div>

                <div>
                    最大Worker数:
                    ${
                        teamResult.maxWorkers
                            ? `${teamResult.maxWorkers.workers} 
                               (Turn ${teamResult.maxWorkers.turn})`
                            : "-"
                    }
                </div>
            </div>
        `;
    };

    panel.innerHTML = `
        <h2 style="margin-top: 0;">
            Replay Analysis
        </h2>

        ${createTeamHTML(result.teams[0])}
        ${createTeamHTML(result.teams[1])}
    `;
}


// app.js からアクセスできるようにする
window.ReplayAnalyzer = ReplayAnalyzer;
window.renderReplayAnalysis = renderReplayAnalysis;