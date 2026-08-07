export const SUPPORTED_PLAYERS = Object.freeze([1, 2, 3, 4, 5, 6]);
export const CLASSIC4_PLAYERS = Object.freeze([1, 2, 3, 4]);
export const CLASSIC6_PLAYERS = SUPPORTED_PLAYERS;

function buildJumpPoints(outerEnd, interval) {
    const points = [];
    for (let pos = 2; pos <= outerEnd; pos += interval) points.push(pos);
    return Object.freeze(points.filter(pos => pos < outerEnd));
}

function rotatePoint(point, degrees) {
    const rad = degrees * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
}

function scalePoint(point, scale) {
    return { x: point.x * scale, y: point.y * scale };
}

function buildHexRing(radius = 112, cellsPerSide = 13) {
    const h = radius * Math.sqrt(3) / 2;
    const vertices = [
        { x: 0, y: -radius },
        { x: h, y: -radius / 2 },
        { x: h, y: radius / 2 },
        { x: 0, y: radius },
        { x: -h, y: radius / 2 },
        { x: -h, y: -radius / 2 }
    ];
    const raw = [];
    for (let side = 0; side < 6; side++) {
        const a = vertices[side];
        const b = vertices[(side + 1) % 6];
        for (let i = 0; i < cellsPerSide; i++) {
            const t = i / cellsPerSide;
            raw.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
    }
    return raw.map((_, index) => raw[(index + 1) % raw.length]);
}

const classic4 = Object.freeze({
    id: 'classic4',
    name: '经典四人',
    playerCount: 4,
    players: CLASSIC4_PLAYERS,
    sectorLength: 13,
    ringLength: 52,
    outerEnd: 50,
    finishStart: 51,
    finishEnd: 56,
    finishLength: 6,
    jumpInterval: 4,
    jumpPoints: buildJumpPoints(50, 4),
    flightPredecessor: 14,
    flightPoint: 18,
    flightTarget: 30,
    flightPostJump: 34,
    finishCrossIndex: 2,
    playerAngles: Object.freeze({ 1: 180, 2: 270, 3: 0, 4: 90 }),
    opponents: Object.freeze({ 1: 3, 2: 4, 3: 1, 4: 2 }),
    getFlightCrossPosition() { return this.finishStart + this.finishCrossIndex; }
});

const classic6Visual = Object.freeze({
    ringRadius: 112,
    // 让 78 格外环在和 classic4 相同的桌面视口中保持接近的视觉直径。
    viewBoxRadius: 160,
    // 六人外环更密集，沿用四人版的视觉重量而不是把 78 格压成细小色点。
    ringCellScale: 0.90,
    laneCellScale: 0.92,
    // 基地和棋子需要与 classic4 的 4 架棋子保持同一可读尺寸。
    baseScale: 1.40,
    chessScale: 0.56,
    baseRadius: 140,
    // 基地向内收后，发射格回到与基地保持清晰间距的位置。
    launchRadiusScale: 1.02,
    endScale: 0.65,
    // 第3格使用 7/13 半径，精确落在 26→50 飞行线与对家终点航道的交点上。
    finishScales: Object.freeze([0.82, 0.68, 7 / 13, 0.40, 0.26, 0.12]),
    flightArrowFractions: Object.freeze([0.30, 0.58])
});

const classic6 = Object.freeze({
    id: 'classic6',
    name: '经典六人',
    playerCount: 6,
    players: CLASSIC6_PLAYERS,
    sectorLength: 13,
    ringLength: 78,
    outerEnd: 76,
    finishStart: 77,
    finishEnd: 82,
    finishLength: 6,
    jumpInterval: 6,
    jumpPoints: buildJumpPoints(76, 6),
    flightPredecessor: 20,
    flightPoint: 26,
    flightTarget: 50,
    flightPostJump: 56,
    finishCrossIndex: 2,
    playerAngles: Object.freeze({ 1: 180, 2: 240, 3: 300, 4: 0, 5: 60, 6: 120 }),
    opponents: Object.freeze({ 1: 4, 2: 5, 3: 6, 4: 1, 5: 2, 6: 3 }),
    referencePlayer: 4,
    referenceOffset: 39,
    visual: classic6Visual,
    getFlightCrossPosition() { return this.finishStart + this.finishCrossIndex; },
    getRingPoints() { return buildHexRing(this.visual.ringRadius, 13); },
    getRingColorPlayer(absoluteIndex) {
        return ((Number(absoluteIndex) + 4) % 6) + 1;
    },
    getBaseSlotPositions() {
        const r = this.visual.baseRadius;
        // #start 的四个圆孔中心是 ±5.8；基地整体缩放后，棋子中心必须使用同样缩放后的孔位。
        const hole = 5.8 * this.visual.baseScale;
        return [
            { x: -hole, y: r - hole }, { x: hole, y: r - hole },
            { x: -hole, y: r + hole }, { x: hole, y: r + hole }
        ];
    },
    createMainTrack() {
        const ring = buildHexRing(this.visual.ringRadius, 13);
        const track = [];
        const launchAnchor = ring[this.referenceOffset];
        track.push(scalePoint(launchAnchor, this.visual.launchRadiusScale));
        for (let relative = 1; relative <= this.outerEnd; relative++) {
            track.push({ ...ring[(this.referenceOffset + relative) % this.ringLength] });
        }
        const entry = ring[(this.referenceOffset + this.outerEnd + 1) % this.ringLength];
        this.visual.finishScales.forEach(scale => track.push(scalePoint(entry, scale)));
        return track;
    },
    rotatePoint
});

export const BOARD_DEFINITIONS = Object.freeze({ classic4, classic6 });

export function getBoardDefinition(id = 'classic4') {
    return BOARD_DEFINITIONS[id] || classic4;
}

function readPlayerNumber(player) {
    if (player && typeof player === 'object') {
        for (const value of [player.color, player.playerNumber, player.id]) {
            const numeric = Number(value);
            if (SUPPORTED_PLAYERS.includes(numeric)) return numeric;
        }
        return null;
    }
    const numeric = Number(player);
    return SUPPORTED_PLAYERS.includes(numeric) ? numeric : null;
}

// classic6 的必要条件由“实际参与者”决定，而不是房间容量：
// 1) 实际参与人数超过 4；或 2) 任一参与阵营为 P5/P6。
export function resolveBoardIdForPlayers(players = [], playerCount = 0) {
    const list = Array.isArray(players) ? players : [];
    const playerNumbers = list.map(readPlayerNumber).filter(Number.isFinite);
    const effectiveCount = Math.max(Number(playerCount) || 0, list.length, playerNumbers.length);
    return effectiveCount > 4 || playerNumbers.some(player => player > 4) ? 'classic6' : 'classic4';
}

export function resolveBoardIdFromStorage() {
    if (typeof sessionStorage === 'undefined') return 'classic4';
    try {
        const local = JSON.parse(sessionStorage.getItem('gameConfig') || 'null');
        if (local) {
            const localPlayers = Array.isArray(local.players)
                ? local.players
                : [local.humanPlayer, ...(Array.isArray(local.bots) ? local.bots : [])].filter(value => value != null);
            const inferredLocal = resolveBoardIdForPlayers(localPlayers, local.playerCount);
            if (inferredLocal === 'classic6') return 'classic6';
            if (local.boardId) return local.boardId;
        }

        const multi = JSON.parse(sessionStorage.getItem('multiplayerGameData') || 'null');
        if (multi) {
            const multiPlayers = multi.players
                || multi.room?.players
                || multi.gameSession?.players
                || multi.gameSession?.gameData?.players
                || [];
            const playerCount = multi.playerCount
                || multi.gameData?.playerCount
                || multi.gameSession?.gameData?.playerCount
                || multi.room?.players?.length
                || 0;
            const inferredMulti = resolveBoardIdForPlayers(multiPlayers, playerCount);
            if (inferredMulti === 'classic6') return 'classic6';

            const boardId = multi.boardId
                || multi.gameData?.boardId
                || multi.gameSession?.gameData?.boardId
                || multi.settings?.boardId
                || multi.room?.settings?.boardId;
            if (boardId) return boardId;
        }
    } catch (error) {
        console.warn('[boardConfig] 读取棋盘配置失败，回退经典四人', error);
    }
    return 'classic4';
}

export function getCurrentBoardDefinition() {
    return getBoardDefinition(resolveBoardIdFromStorage());
}

function getClassic4AbsolutePosition(player, relativePosition) {
    if (relativePosition === -1) return -1;
    if (relativePosition >= classic4.finishStart) return relativePosition;
    if (relativePosition === 0) return 0;

    if (player === 1) return relativePosition;
    if (player === 4) {
        if (relativePosition >= 14) return relativePosition - 13;
        if (relativePosition >= 1 && relativePosition <= 11) return relativePosition + 39;
        if (relativePosition === 12) return -3;
        if (relativePosition === 13) return -2;
    }
    if (player === 3) {
        if (relativePosition >= 1 && relativePosition <= 24) return relativePosition + 26;
        if (relativePosition === 25) return -3;
        if (relativePosition === 26) return -2;
        if (relativePosition >= 27) return relativePosition - 26;
    }
    if (player === 2) {
        if (relativePosition >= 1 && relativePosition <= 37) return relativePosition + 13;
        if (relativePosition === 38) return -3;
        if (relativePosition === 39) return -2;
        if (relativePosition >= 40) return relativePosition - 39;
    }
    return relativePosition;
}

export function getAbsolutePositionForBoard(player, relativePosition, board = getCurrentBoardDefinition()) {
    const numericPlayer = Number(player);
    const numericPosition = Number(relativePosition);
    if (board.id === 'classic4') return getClassic4AbsolutePosition(numericPlayer, numericPosition);

    if (numericPosition === -1) return -1;
    if (numericPosition === 0) return -(100 + numericPlayer);
    if (numericPosition >= board.finishStart) return 1000 + numericPlayer * 100 + numericPosition;
    if (numericPosition < 1 || numericPosition > board.outerEnd) return numericPosition;

    const offset = (numericPlayer - 1) * board.sectorLength;
    const canonical = (numericPosition + offset) % board.ringLength;
    if (canonical === board.ringLength - 1) return -3;
    if (canonical === 0) return -2;
    return canonical;
}

export function isJumpPointForBoard(position, board = getCurrentBoardDefinition()) {
    return board.jumpPoints.includes(Number(position));
}

export function getNextJumpPointForBoard(position, board = getCurrentBoardDefinition()) {
    const next = Number(position) + board.jumpInterval;
    return next <= board.outerEnd ? next : null;
}

export function getOpponentForBoard(player, board = getCurrentBoardDefinition()) {
    return board.opponents[Number(player)] ?? null;
}

export function getFlightCrossPositionForBoard(board = getCurrentBoardDefinition()) {
    return board.getFlightCrossPosition();
}
