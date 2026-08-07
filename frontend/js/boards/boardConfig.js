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
    const raw = [];
    for (let side = 0; side < 6; side++) {
        const a = vertices[side];
        const b = vertices[(side + 1) % 6];
        for (let i = 0; i < cellsPerSide; i++) {
            const t = i / cellsPerSide;
            raw.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
    }
    // 让参考阵营的两个入口连接格落在六边形底部：保持绝对位置编号规则不变，只调整视觉索引起点。
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

const classic6 = Object.freeze({
    id: 'classic6',
    name: '经典六人',
    playerCount: 6,
    players: CLASSIC6_PLAYERS,
    // 原四人棋盘各阵营入口相位相差13格；六阵营继续保持这一结构。
    sectorLength: 13,
    ringLength: 78,
    // 与四人盘一致：每个玩家自己的两个入口连接格不在其50/76格公共行进序列中。
    outerEnd: 76,
    finishStart: 77,
    finishEnd: 82,
    finishLength: 6,
    // 六色循环，自身颜色格每6格出现一次。
    jumpInterval: 6,
    jumpPoints: buildJumpPoints(76, 6),
    // 原四人盘飞行格是第5个自身颜色格：2,6,10,14,18。
    // 六人盘保持同一语义：2,8,14,20,26。
    flightPredecessor: 20,
    flightPoint: 26,
    // 按原四人 SVG 的几何关系推导：飞行线横跨对家第3个终点航道格。
    // 六边形参考阵营中 26 -> 50 对应原四人盘的 18 -> 30。
    flightTarget: 50,
    flightPostJump: 56,
    finishCrossIndex: 2,
    // 参考阵营4位于下方，其他阵营每60度旋转。
    playerAngles: Object.freeze({ 1: 180, 2: 240, 3: 300, 4: 0, 5: 60, 6: 120 }),
    opponents: Object.freeze({ 1: 4, 2: 5, 3: 6, 4: 1, 5: 2, 6: 3 }),
    referencePlayer: 4,
    referenceOffset: 39,
    getFlightCrossPosition() { return this.finishStart + this.finishCrossIndex; },
    getRingPoints() { return buildHexRing(80, 13); },
    getRingColorPlayer(absoluteIndex) {
        // 玩家1相对位置2是1号色；13格阵营相位在六色循环下自然顺延一色。
        return ((Number(absoluteIndex) + 4) % 6) + 1;
    },
    getBaseSlotPositions() {
        // 同原版：所有阵营共用一套参考坐标，再由玩家基础角度旋转。
        return [
            { x: -6.1, y: 91.5 }, { x: 6.1, y: 91.5 },
            { x: -6.1, y: 103.7 }, { x: 6.1, y: 103.7 }
        ];
    },
    createMainTrack() {
        const ring = buildHexRing(80, 13);
        const track = [];
        // 参考玩家4的入口相位为39；位置0是独立起飞跑道，不参与公共碰撞。
        const launchAnchor = ring[this.referenceOffset];
        track.push(scalePoint(launchAnchor, 1.085));
        for (let relative = 1; relative <= this.outerEnd; relative++) {
            track.push({ ...ring[(this.referenceOffset + relative) % this.ringLength] });
        }
        // 原版终点航道相对外圈半径的比例：66/80,54/80,42/80,30/80,18/80,5/80。
        const entry = ring[(this.referenceOffset + this.outerEnd + 1) % this.ringLength];
        const finishScales = [0.825, 0.675, 0.525, 0.375, 0.225, 0.0625];
        finishScales.forEach(scale => track.push(scalePoint(entry, scale)));
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

function getClassic4AbsolutePosition(player, relativePosition) {
    // 逐项保留原 utils.getAbsolutePosition 的四人映射，避免六人改造改变经典四人碰撞语义。
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
    if (numericPosition === 0) return -(100 + numericPlayer); // 六人盘的六条起飞跑道彼此独立。
    if (numericPosition >= board.finishStart) return 1000 + numericPlayer * 100 + numericPosition;
    if (numericPosition < 1 || numericPosition > board.outerEnd) return numericPosition;

    const offset = (numericPlayer - 1) * board.sectorLength;
    const canonical = (numericPosition + offset) % board.ringLength;
    // 与原四人盘一致：每个阵营有两个公共参考系不可达的入口连接格，用 -3/-2 编码。
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
