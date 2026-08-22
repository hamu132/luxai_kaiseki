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

    getResearchCurve(team) {
        const curve = [];

        for (let frameIndex = 0; frameIndex < this.frames.length; frameIndex++) {
            const researchPoints =
            this.getTeamState(frameIndex, team)?.researchPoints ?? 0;

            curve.push({
                turn: frameIndex,
                researchPoints: researchPoints,
            });
        }

        return curve;
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
     * 指定Frame・Teamの全CityのFuel合計
     */
    getTotalFuel(frameIndex, team) {
        const frame = this.frames[frameIndex];

        if (!frame?.cityData) {
            return 0;
        }

        return [...frame.cityData.values()]
            .filter(city => city.team === team)
            .reduce((sum, city) => sum + city.fuel, 0);
    }
    /**
     * 各Nightの開始時と終了時の状態を比較
     *
     * Lux Season 1:
     * 30 Turns Day + 10 Turns Night
     *
     * 各Nightについて以下を取得:
     * - CityTile数の増減
     * - Worker数の増減
     * - Fuelの増減
     * - Night終了時の残りFuel
     */
    getNightComparison(team) {
        const nights = [];

        for (
            let startTurn = 30;
            startTurn < this.frames.length;
            startTurn += 40
        ) {
            const endTurn = Math.min(
                startTurn + 10,
                this.frames.length - 1
            );

            const cityStart =
                this.getCityTileCount(startTurn, team);

            const cityEnd =
                this.getCityTileCount(endTurn, team);

            const workerStart =
                this.getWorkerCount(startTurn, team);

            const workerEnd =
                this.getWorkerCount(endTurn, team);

            const fuelStart =
                this.getTotalFuel(startTurn, team);

            const fuelEnd =
                this.getTotalFuel(endTurn, team);

            nights.push({
                night: nights.length + 1,

                startTurn,
                endTurn,

                cityTileDiff:
                    cityEnd - cityStart,

                workerDiff:
                    workerEnd - workerStart,

                fuelDiff:
                    fuelEnd - fuelStart,

                remainingFuel:
                    fuelEnd,

                atRiskCities:
                    this.getAtRiskCities(startTurn, team),

                atRiskCityCount:
                    this.getAtRiskCities(startTurn, team).length,
            });
        }

        return nights;
    }

    /**
     * Night開始時点で生存が危険なCityを取得
     *
     * Survival Turns = Fuel / Upkeep
     *
     * 10 Turns未満:
     * - 5以上10未満: Risk
     * - 5未満: Critical
     */
    getAtRiskCities(frameIndex, team) {
        const frame = this.frames[frameIndex];

        if (!frame?.cityData) {
            return [];
        }

        const result = [];

        for (const [cityId, city] of frame.cityData.entries()) {
            if (city.team !== team) {
                continue;
            }

            const survivalTurns =
                city.upkeep > 0
                    ? city.fuel / city.upkeep
                    : Infinity;

            if (survivalTurns < 10) {
                result.push({
                    cityId,
                    cityTiles: city.cityTilePositions?.length ?? 0,
                    fuel: city.fuel,
                    upkeep: city.upkeep,
                    survivalTurns,
                    status:
                        survivalTurns < 5
                            ? "Critical"
                            : "Risk",
                });
            }
        }

        return result;
    }
    /**
     * 長時間ほとんど状態が変化していないWorkerを検出
     *
     * Possible Inactive の条件:
     * - 位置が変わらない
     * - Cargoが増えていない
     * - 上記がminInactiveTurns以上連続
     *
     * 注意:
     * Cargoが減少する場合はInactive扱いの可能性がある。
     * この機能は「故障」を確定するものではなく、
     * Possible Inactive Workerを検出するためのもの。
     */
    getInactiveWorkers(team, minInactiveTurns = 20) {
        const result = [];
        const states = new Map();

        const cargoIncreased = (current, previous) => {
            return (
                (current?.wood ?? 0) > (previous?.wood ?? 0) ||
                (current?.coal ?? 0) > (previous?.coal ?? 0) ||
                (current?.uranium ?? 0) > (previous?.uranium ?? 0)
            );
        };

        const flush = (unitId) => {
            const state = states.get(unitId);

            if (
                state &&
                state.startTurn !== null &&
                state.count >= minInactiveTurns
            ) {
                result.push({
                    type: "Worker",
                    id: unitId,
                    inactiveTurns: state.count,
                    startTurn: state.startTurn,
                    endTurn: state.endTurn,
                });
            }

            if (state) {
                state.startTurn = null;
                state.endTurn = null;
                state.count = 0;
            }
        };

        for (
            let frameIndex = 1;
            frameIndex < this.frames.length;
            frameIndex++
        ) {
            const previousFrame = this.frames[frameIndex - 1];
            const currentFrame = this.frames[frameIndex];

            if (!previousFrame?.unitData || !currentFrame?.unitData) {
                continue;
            }

            const currentWorkers = new Set();

            for (const [unitId, unit] of currentFrame.unitData.entries()) {
                if (unit.team !== team || unit.type !== 0) {
                    continue;
                }

                currentWorkers.add(unitId);

                const previousUnit =
                    previousFrame.unitData.get(unitId);

                if (!previousUnit) {
                    continue;
                }

                if (!states.has(unitId)) {
                    states.set(unitId, {
                        startTurn: null,
                        endTurn: null,
                        count: 0,
                    });
                }

                const state = states.get(unitId);

                const samePosition =
                    unit.pos.x === previousUnit.pos.x &&
                    unit.pos.y === previousUnit.pos.y;

                const hasCargoIncrease =
                    cargoIncreased(
                        unit.cargo,
                        previousUnit.cargo
                    );

                if (
                    samePosition &&
                    !hasCargoIncrease
                ) {
                    if (state.startTurn === null) {
                        state.startTurn = frameIndex - 1;
                    }

                    state.endTurn = frameIndex;
                    state.count += 1;
                } else {
                    flush(unitId);
                }
            }

            // Workerが消滅した場合、それまでのinactive区間を確定
            for (const unitId of states.keys()) {
                if (!currentWorkers.has(unitId)) {
                    flush(unitId);
                }
            }
        }

        // Replay終了時までinactiveだったWorkerを確定
        for (const unitId of states.keys()) {
            flush(unitId);
        }

        return result;
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
            nightComparison:
                this.getNightComparison(team),

            researchCurve:
                this.getResearchCurve(team),

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

            inactiveWorkers:
                this.getInactiveWorkers(team),
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

            width: "400px",

            padding: "0",

            background: "rgba(0, 0, 0, 0.80)",
            color: "white",

            fontFamily: "monospace",
            fontSize: "13px",

            borderRadius: "10px",

            zIndex: "99999",

            maxHeight: "80vh",
            overflow: "hidden",
        });

        document.body.appendChild(panel);

        enableDrag(panel, "#replay-analysis-header");
    }

    const formatTurn = (event) => {
        if (!event) {
            return "-";
        }

        return `Turn ${event.turn}`;
    };

    const createTeamHTML = (teamResult) => {
        const row = (label, value) => `
            <div
                style="
                    display: grid;
                    grid-template-columns: 210px 12px 1fr;
                    column-gap: 4px;
                    margin-bottom: 4px;
                    line-height: 1.5;
                "
            >
                <span>${label}</span>
                <span>:</span>
                <span>${value}</span>
            </div>
        `;

        return `
            <div style="margin-bottom: 18px;">
                <h3 style="margin-bottom: 8px;">
                    Team ${teamResult.team}
                </h3>

                ${row("最初の木材採取",
                    formatTurn(teamResult.firstWoodCollection))}

                ${row("石炭研究（研究ポイント50）",
                    formatTurn(teamResult.coalResearch))}

                ${row("最初の石炭採取",
                    formatTurn(teamResult.firstCoalCollection))}

                ${row("ウラン研究（研究ポイント200）",
                    formatTurn(teamResult.uraniumResearch))}

                ${row("最初のウラン採取",
                    formatTurn(teamResult.firstUraniumCollection))}

                ${row("最初のCity建設",
                    formatTurn(teamResult.firstCityBuilt))}

                ${row(
                    "最大Worker数",
                    teamResult.maxWorkers
                        ? `${teamResult.maxWorkers.workers} (Turn ${teamResult.maxWorkers.turn})`
                        : "-"
                )}
            </div>
        `;
    };

    panel.innerHTML = `
        <div
            id="replay-analysis-header"
            ...
        >
            Replay Analysis
        </div>

        <div
            style="
                padding: 16px;
                max-height: calc(80vh - 50px);
                overflow-y: auto;
            "
        >
            ${createTeamHTML(result.teams[0])}
            ${createTeamHTML(result.teams[1])}

            <canvas id="research-chart" width="360" height="180"></canvas>
        </div>
    `;
    // research curve
    const canvas = document.getElementById("research-chart");
    const ctx = canvas.getContext("2d");

    const team0 = result.teams[0].researchCurve;
    const team1 = result.teams[1].researchCurve;

    const padding = 40;
    const chartWidth = canvas.width - padding * 2;
    const chartHeight = canvas.height - padding * 2;

    const maxTurn = Math.max(
        team0[team0.length - 1]?.turn ?? 0,
        team1[team1.length - 1]?.turn ?? 0
    );

    const maxRP = Math.max(
        ...team0.map(d => d.researchPoints),
        ...team1.map(d => d.researchPoints),
        200
    );

    const drawLine = (data, color) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;

        data.forEach((point, index) => {
            const x =
                padding +
                (point.turn / maxTurn) * chartWidth;

            const y =
                canvas.height -
                padding -
                (point.researchPoints / maxRP) * chartHeight;

            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();
    };

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawLine(team0, "#FFD700"); // Team 0: yellow
    drawLine(team1, "#1E90FF"); // Team 1: blue
    // ===== Title =====
    ctx.fillStyle = "white";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";

    ctx.fillText(
        "Research Points vs Turn",
        canvas.width / 2,
        18
    );


    // ===== X / Y Axis =====
    ctx.strokeStyle = "white";
    ctx.lineWidth = 1;

    ctx.beginPath();

    // Y axis
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding);

    // X axis
    ctx.lineTo(canvas.width - padding, canvas.height - padding);

    ctx.stroke();


    // ===== X Axis Ticks =====
    ctx.fillStyle = "white";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";

    const xTickStep = 50;

    for (let turn = 0; turn <= maxTurn; turn += xTickStep) {

        const x =
            padding +
            (turn / maxTurn) * chartWidth;

        // tick mark
        ctx.beginPath();
        ctx.moveTo(x, canvas.height - padding);
        ctx.lineTo(x, canvas.height - padding + 4);
        ctx.stroke();

        // number
        ctx.fillText(
            turn.toString(),
            x,
            canvas.height - padding + 14
        );
    }


    // ===== Y Axis Ticks =====
    ctx.textAlign = "right";

    const yTickStep = 50;

    for (let rp = 0; rp <= maxRP; rp += yTickStep) {

        const y =
            canvas.height -
            padding -
            (rp / maxRP) * chartHeight;

        // tick mark
        ctx.beginPath();
        ctx.moveTo(padding - 4, y);
        ctx.lineTo(padding, y);
        ctx.stroke();

        // number
        ctx.fillText(
            rp.toString(),
            padding - 7,
            y + 3
        );
    }


    // ===== X Axis Label =====
    ctx.textAlign = "center";
    ctx.font = "11px sans-serif";

    ctx.fillText(
        "Turn",
        canvas.width / 2,
        canvas.height - 3
    );


    // ===== Y Axis Label =====
    ctx.save();

    ctx.translate(10, canvas.height / 2);
    ctx.rotate(-Math.PI / 2);

    ctx.textAlign = "center";
    ctx.fillText(
        "Research Points",
        0,
        0
    );

    ctx.restore();
}

function renderNightAnalysis(result) {
    let panel = document.getElementById("night-analysis-panel");

    if (!panel) {
        panel = document.createElement("div");
        panel.id = "night-analysis-panel";

        Object.assign(panel.style, {
            position: "fixed",
            top: "60px",
            left: "20px",
            width: "520px",
            background: "rgba(0, 0, 0, 0.80)",
            color: "white",
            fontFamily: "monospace",
            fontSize: "12px",
            borderRadius: "10px",
            zIndex: "99999",
            height: "420px",
            overflow: "hidden",
        });

        document.body.appendChild(panel);
        enableDrag(panel, "#night-analysis-header");
    }

    panel.innerHTML = `
        <div
            id="night-analysis-header"
            style="
                padding: 12px 16px;
                cursor: move;
                user-select: none;
                font-weight: bold;
                border-bottom: 1px solid rgba(255,255,255,0.2);
            "
        >
            Night Analysis
        </div>

        <div
            style="
                padding: 16px;
                height: 350px;
                overflow-y: auto;
            "
        >

            ${[0, 1].map(team => {
                const nights = result.teams[team].nightComparison ?? [];

                const formatDiff = (value) => {
                    if (value > 0) return `+${value}`;
                    return `${value}`;
                };
                const diffColor = (value) => {
                    if (value < 0) return "#ff6b6b";  // negative: red
                    if (value > 0) return "#6bff95";  // positive: green
                    return "white";                   // zero
                };

                const rows = nights.map(night => `
                    <tr
                        style="cursor: pointer;"
                        onclick="
                            const detail = document.getElementById('night-detail-${team}-${night.night}');
                            detail.style.display =
                                detail.style.display === 'none'
                                    ? 'table-row'
                                    : 'none';
                        "
                    >
                        <td>Night ${night.night}</td>
                        <td>${night.startTurn}-${night.endTurn}</td>

                        <td style="color: ${diffColor(night.cityTileDiff)};">
                            ${formatDiff(night.cityTileDiff)}
                        </td>

                        <td style="color: ${diffColor(night.workerDiff)};">
                            ${formatDiff(night.workerDiff)}
                        </td>

                        <td style="color: ${diffColor(night.fuelDiff)};">
                            ${formatDiff(Math.round(night.fuelDiff))}
                        </td>

                        <td>${Math.round(night.remainingFuel)}</td>

                        <td>${night.atRiskCityCount}</td>
                    </tr>

                    <tr
                        id="night-detail-${team}-${night.night}"
                        style="display: none;"
                    >
                        <td colspan="7" style="padding: 10px;">
                            ${
                                night.atRiskCities.length === 0
                                    ? "No at-risk cities"
                                    : night.atRiskCities.map(city => `
                                        <div style="margin-bottom: 4px;">
                                            ${city.cityId}
                                            | Tiles: ${city.cityTiles}
                                            | Fuel: ${Math.round(city.fuel)}
                                            | Upkeep: ${Math.round(city.upkeep)}
                                            | Survival: ${city.survivalTurns.toFixed(1)} turns
                                            | ${city.status}
                                        </div>
                                    `).join("")
                            }
                        </td>
                    </tr>
                `).join("");

                return `
                    <div style="margin-bottom: 18px;">
                        <h3 style="margin-bottom: 8px;">
                            Team ${team}
                        </h3>

                        <table
                            style="
                                width: 100%;
                                border-collapse: collapse;
                                text-align: center;
                            "
                        >
                            <thead>
                                <tr>
                                    <th>Night</th>
                                    <th>Turn</th>
                                    <th>CityTile Δ</th>
                                    <th>Worker Δ</th>
                                    <th>Fuel Δ</th>
                                    <th>Remaining Fuel</th>
                                    <th>At-risk Cities</th>
                                </tr>
                            </thead>

                            <tbody>
                                ${rows}
                            </tbody>
                        </table>
                    </div>
                `;
            }).join("")}

        </div>
    `;
}
function renderInactiveWorkerAnalysis(result) {
    let panel = document.getElementById("inactive-worker-analysis-panel");

    if (!panel) {
        panel = document.createElement("div");
        panel.id = "inactive-worker-analysis-panel";

        Object.assign(panel.style, {
            position: "fixed",

            top: "480px",
            left: "20px",

            width: "520px",

            background: "rgba(0, 0, 0, 0.80)",
            color: "white",

            fontFamily: "monospace",
            fontSize: "12px",

            borderRadius: "10px",

            zIndex: "99999",

            height: "360px",
            overflow: "hidden",
        });

        document.body.appendChild(panel);

        enableDrag(panel, "#inactive-worker-analysis-header");
    }

    const createTeamHTML = (team) => {
        const workers =
            result.teams[team].inactiveWorkers ?? [];

        // 長いInactiveから順に表示
        const sortedWorkers = [...workers].sort(
            (a, b) => b.inactiveTurns - a.inactiveTurns
        );

        const rows = sortedWorkers.map(worker => `
            <tr>
                <td>${worker.id}</td>

                <td>
                    ${worker.inactiveTurns}
                </td>

                <td>
                    ${worker.startTurn}-${worker.endTurn}
                </td>
            </tr>
        `).join("");

        return `
            <div style="margin-bottom: 18px;">
                <h3 style="margin-bottom: 8px;">
                    Team ${team}
                </h3>

                ${
                    sortedWorkers.length === 0
                        ? `<div>No inactive workers</div>`
                        : `
                            <table
                                style="
                                    width: 100%;
                                    border-collapse: collapse;
                                    text-align: center;
                                "
                            >
                                <thead>
                                    <tr>
                                        <th>Worker</th>
                                        <th>Inactive Turns</th>
                                        <th>Turn Range</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    ${rows}
                                </tbody>
                            </table>
                        `
                }
            </div>
        `;
    };

    panel.innerHTML = `
        <div
            id="inactive-worker-analysis-header"
            style="
                padding: 12px 16px;
                cursor: move;
                user-select: none;
                font-weight: bold;
                border-bottom: 1px solid rgba(255,255,255,0.2);
            "
        >
            Inactive Worker Analysis
        </div>

        <div
            style="
                padding: 16px;
                height: 290px;
                overflow-y: auto;
            "
        >
            ${createTeamHTML(0)}
            ${createTeamHTML(1)}
        </div>
    `;
}

function enableDrag(panel, headerSelector) {
    let isDragging = false;

    let offsetX = 0;
    let offsetY = 0;

    panel.addEventListener("mousedown", (event) => {
        const header = event.target.closest(headerSelector);

        if (!header) {
            return;
        }

        isDragging = true;

        const rect = panel.getBoundingClientRect();

        offsetX = event.clientX - rect.left;
        offsetY = event.clientY - rect.top;

        panel.style.right = "auto";

        document.body.style.userSelect = "none";
    });

    document.addEventListener("mousemove", (event) => {
        if (!isDragging) {
            return;
        }

        let x = event.clientX - offsetX;
        let y = event.clientY - offsetY;

        const maxX = window.innerWidth - panel.offsetWidth;
        const maxY = window.innerHeight - panel.offsetHeight;

        x = Math.max(0, Math.min(x, maxX));
        y = Math.max(0, Math.min(y, maxY));

        panel.style.left = `${x}px`;
        panel.style.top = `${y}px`;
    });

    document.addEventListener("mouseup", () => {
        if (!isDragging) {
            return;
        }

        isDragging = false;

        document.body.style.userSelect = "";
    });
}
// app.js からアクセスできるようにする
window.ReplayAnalyzer = ReplayAnalyzer;
window.renderReplayAnalysis = renderReplayAnalysis;
window.renderNightAnalysis = renderNightAnalysis;
window.renderInactiveWorkerAnalysis =
    renderInactiveWorkerAnalysis;