export const SUPPORTED_PLAYERS = Object.freeze([1, 2, 3, 4, 5, 6]);
export const CLASSIC4_PLAYERS = Object.freeze([1, 2, 3, 4]);
export const CLASSIC6_PLAYERS = SUPPORTED_PLAYERS;

function buildJumpPoints(outerEnd, interval) {
    const points = [];
    for (let pos = 2; pos <= outerEnd - interval; pos += interval) points.push(pos);
    return Object.freeze(points);
}

function rotatePoint(point, degrees) {
    const rad = degrees * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
}

function buildHexRing(radius = 80, cellsPerSide = 13) {
    const h = radius * Math.sqrt(3) / 2;
    const vertices = [
        { x: 0, y: -radius },
        { x: h, y: -radius / 2 },
        { x: h, y: radius / 2 },
        { x: 0, y: radius },
        { x: -h, y: radius / 2 },
        { x: -h, y: -radius / 2 }
    ];
    const points = [];
    for (let side = 0; side < 6; side++) {
        const a = vertices[side];
        const b = vertices[(side + 1) % 6];
        for (let i = 0; i < cellsPerSide; i++) {
            const t = i / cellsPerSide;
            points.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
    }
    return points;
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
    opponents: Object.freeze({ 1: 3, 2: 4, 3: 1, 4: 2 })
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
    // 延续四人盘：第5个自身颜色格为飞行格；跳入/直接落入的处理规则保持原样。
    flightPredecessor: 20,
    flightPoint: 26,
    // 飞过中心后落到对面之后的首个自身颜色格，再按原规则决定是否追加一次跳子。
    flightTarget: 68,
    flightPostJump: 74,
    finishCrossIndex: 2,
    playerAngles: Object.freeze({ 1: 180, 2: 240, 3: 300, 4: 0, 5: 60, 6: 120 }),
    opponents: Object.freeze({ 1: 4, 2: 5, 3: 6, 4: 1, 5: 2, 6: 3 }),
    createMainTrack() {
        const ring = buildHexRing(80, 13);
        const track = [];
        // 0 是起飞点；1..76 是公共外圈；77..82 是当前玩家自己的终点航道。
        track.push({ ...ring[0] });
        for (let i = 1; i <= this.outerEnd; i++) track.push({ ...ring[i] });
        const entry = ring[77];
        for (let i = 0; i < this.finishLength; i++) {
            const t = (i + 1) / (this.finishLength + 1);
            track.push({ x: entry.x * (1 - t), y: entry.y * (1 - t) });
        }
        return track;
    },
    getRingPoints() { return buildHexRing(80, 13); },
    rotatePoint
});

export const BOARD_DEFINITIONS = Object.freeze({ classic4, classic6 });

export function getBoardDefinition(id = 'classic4') {
    return BOARD_DEFINITIONS[id] || classic4;
}

export function resolveBoardIdFromStorage() {
    try {
        const local = JSON.parse(sessionStorage.getItem('gameConfig') || 'null');
        if (local?.boardId) return local.boardId;
        if (Number(local?.playerCount) > 4) return 'classic6';
        const multi = JSON.parse(sessionStorage.getItem('multiplayerGameData') || 'null');
        const boardId = multi?.boardId || multi?.settings?.boardId || multi?.room?.settings?.boardId;
        if (boardId) return boardId;
        const maxPlayers = multi?.maxPlayers || multi?.settings?.maxPlayers || multi?.room?.settings?.maxPlayers;
        if (Number(maxPlayers) > 4) return 'classic6';
    } catch (error) {
        console.warn('[boardConfig] 读取棋盘配置失败，回退经典四人', error);
    }
    return 'classic4';
}

export function getCurrentBoardDefinition() {
    return getBoardDefinition(resolveBoardIdFromStorage());
}

export function getAbsolutePositionForBoard(player, relativePosition, board = getCurrentBoardDefinition()) {
    if (relativePosition === -1) return -1;
    if (relativePosition === 0) return -(100 + Number(player)); // 每个阵营独立起飞点，避免互撞。
    if (relativePosition >= board.finishStart) return 1000 + Number(player) * 100 + relativePosition;
    if (relativePosition < 1 || relativePosition > board.outerEnd) return relativePosition;
    const offset = (Number(player) - 1) * board.sectorLength;
    return (relativePosition + offset) % board.ringLength;
}

export function isJumpPointForBoard(position, board = getCurrentBoardDefinition()) {
    return board.jumpPoints.includes(position);
}

export function getNextJumpPointForBoard(position, board = getCurrentBoardDefinition()) {
    const next = position + board.jumpInterval;
    return next <= board.outerEnd ? next : null;
}

export function getOpponentForBoard(player, board = getCurrentBoardDefinition()) {
    return board.opponents[Number(player)] ?? null;
}
