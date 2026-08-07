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
    opponents: Object.freeze({ 1: 3, 2: 4, 3: 1, 4: 2 }),
    getFlightCrossPosition() { return this.finishStart + this.finishCrossIndex; }
});

const classic6 = Object.freeze({
    id: 'classic6',
    name: '经典六人',
    playerCount: 6,
    players: CLASSIC6_PLAYERS,
    // 原四人棋盘四个阵营的入口相位相差13格；六人盘继续保持这一结构。
    sectorLength: 13,
    ringLength: 78,
    // 与四人盘相同：公共环道总长度减去每方不可达的两个入口连接格。
    outerEnd: 76,
    finishStart: 77,
    finishEnd: 82,
    finishLength: 6,
    // 六种颜色循环，因此自身颜色格每6格出现一次。
    jumpInterval: 6,
    jumpPoints: buildJumpPoints(76, 6),
    // 四人盘的飞行格是第5个自身颜色格：2,6,10,14,18。
    // 六人盘保持同一语义：2,8,14,20,26。
    flightPredecessor: 20,
    flightPoint: 26,
    // 四人盘 18 -> 30 跨越 (4-1) 个同色间隔；六人盘等价为 26 -> 56。
    flightTarget: 56,
    flightPostJump: 62,
    finishCrossIndex: 2,
    // 参考坐标系使用4号阵营（下方）为0度；其余阵营每60度旋转。
    playerAngles: Object.freeze({ 1: 180, 2: 240, 3: 300, 4: 0, 5: 60, 6: 120 }),
    opponents: Object.freeze({ 1: 4, 2: 5, 3: 6, 4: 1, 5: 2, 6: 3 }),
    referencePlayer: 4,
    referenceOffset: 39,
    getFlightCrossPosition() { return this.finishStart + this.finishCrossIndex; },
    getRingPoints() { return buildHexRing(80, 13); },
    getRingColorPlayer(absoluteIndex) {
        // 让玩家1的相对位置2为1号色；每个阵营入口相位13格，模6后恰好顺延一种颜色。
        return ((Number(absoluteIndex) + 4) % 6) + 1;
    },
    getBaseSlotPositions() {
        // 与原版一样：所有阵营共用一套基础坐标，再由 playerAngles 旋转。
        return [
            { x: -6.1, y: 91.5 }, { x: 6.1, y: 91.5 },
            { x: -6.1, y: 103.7 }, { x: 6.1, y: 103.7 }
        ];
    },
    createMainTrack() {
        const ring = buildHexRing(80, 13);
        const track = [];
        // 参考玩家4的公共入口相位为39。位置0是独立起飞跑道，不属于公共碰撞环道。
        const launchAnchor = ring[this.referenceOffset];
        track.push(scalePoint(launchAnchor, 1.085));
        for (let relative = 1; relative <= this.outerEnd; relative++) {
            track.push({ ...ring[(this.referenceOffset + relative) % this.ringLength] });
        }
        // 外圈走完后，从参考玩家的入口连接点向中心进入6格终点航道。
        const entry = ring[(this.referenceOffset + this.outerEnd + 1) % this.ringLength];
        for (let i = 0; i < this.finishLength; i++) {
            const t = (i + 1) / (this.finishLength + 1);
            track.push({ x: entry.x * (1 - t), y: entry.y * (1 - t) });
        }
        return track;
    },
    rotatePoint
});

export const BOARD_DEFINITIONS = Object.freeze({ classic4, classic6 });

export function getBoardDefinition(id = 'classic4') {
    return BOARD_DEFINITIONS[id] || classic4;
}

export function resolveBoardIdFromStorage() {
    if (typeof sessionStorage === 'undefined') return 'classic4';
    try {
        const local = JSON.parse(sessionStorage.getItem('gameConfig') || 'null');
        if (local?.boardId) return local.boardId;
        if (Number(local?.playerCount) > 4) return 'classic6';
        const multi = JSON.parse(sessionStorage.getItem('multiplayerGameData') || 'null');
        const boardId = multi?.boardId || multi?.settings?.boardId || multi?.room?.settings?.boardId;
        if (boardId) return boardId;
        const maxPlayers = multi?.maxPlayers || multi?.settings?.maxPlayers || multi?.room?.settings?.maxPlayers;
        if (Number(maxPlayers) > 4) return 'classic6';
        if (Array.isArray(multi?.players) && multi.players.length > 4) return 'classic6';
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
