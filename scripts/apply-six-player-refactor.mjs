import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const write = (rel, content) => {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
};
const patch = (rel, fn) => write(rel, fn(read(rel)));
const replaceOnce = (text, search, replacement, label = String(search)) => {
  if (!text.includes(search)) throw new Error(`Missing pattern: ${label}`);
  return text.replace(search, replacement);
};

const boardConfig = `export const SUPPORTED_PLAYERS = Object.freeze([1, 2, 3, 4, 5, 6]);
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
`;
write('frontend/js/boards/boardConfig.js', boardConfig);

const renderer = `import { getCurrentBoardDefinition } from './boards/boardConfig.js';

const NS = 'http://www.w3.org/2000/svg';
const make = (tag, attrs = {}) => {
    const el = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
    return el;
};
const rotate = (point, degrees) => {
    const r = degrees * Math.PI / 180;
    return { x: point.x * Math.cos(r) - point.y * Math.sin(r), y: point.x * Math.sin(r) + point.y * Math.cos(r) };
};

function ensurePlayerCard(container, player, mobile = false) {
    if (!container || container.querySelector('.player-' + player + '-info')) return;
    const card = document.createElement('div');
    card.className = 'player-info player-' + player + '-info';
    const defeats = [1,2,3,4,5,6].filter(p => p !== player).map(p =>
        '<div class="defeat-count player-' + p + '-defeat" id="defeat-count-' + (mobile ? 'mobile-' : '') + player + '-' + p + '">0</div>'
    ).join('');
    card.innerHTML = '<div class="player-main"><div class="player-avatar player-' + player + '-avatar"><div class="player-emoji" id="player-' + player + '-emoji' + (mobile ? '-mobile' : '') + '"></div></div><div class="player-name">Player ' + player + '</div></div><div class="defeat-counts' + (mobile ? ' defeat-counts-mobile' : '') + '">' + defeats + '</div>';
    container.appendChild(card);
}

function ensureSixPlayerPanels() {
    const desktop = document.querySelector('.players-info');
    const top = document.querySelector('.players-top');
    const bottom = document.querySelector('.players-bottom');
    ensurePlayerCard(desktop, 5, false);
    ensurePlayerCard(desktop, 6, false);
    ensurePlayerCard(top, 6, true);
    ensurePlayerCard(bottom, 5, true);
    if (desktop) {
        [...desktop.querySelectorAll('.player-info')].forEach((el) => {
            const m = el.className.match(/player-(\\d+)-info/);
            if (m) el.classList.add('six-seat-' + m[1]);
        });
    }
}

export function prepareBoardForCurrentMode() {
    const board = getCurrentBoardDefinition();
    if (board.id !== 'classic6') return board;
    document.body.classList.add('six-player-mode');
    ensureSixPlayerPanels();
    const svg = document.getElementById('board-svg');
    if (!svg || svg.dataset.boardId === 'classic6') return board;
    const defs = svg.querySelector('defs');
    [...svg.children].forEach(child => { if (child !== defs) child.remove(); });
    svg.dataset.boardId = 'classic6';

    const ring = board.getRingPoints();
    const layer = make('g', { id: 'classic6-board-layer' });
    svg.appendChild(layer);
    ring.forEach((point, index) => {
        const color = (index % 6) + 1;
        const cell = make('use', { href: '#vr2', x: point.x, y: point.y, class: 'player-' + color + ' six-ring-cell', 'data-ring-pos': index });
        layer.appendChild(cell);
    });

    const baseTrack = board.createMainTrack();
    board.players.forEach(player => {
        const angle = board.playerAngles[player] - board.playerAngles[1];
        const launch = rotate(baseTrack[0], angle);
        const baseCenter = rotate({ x: 0, y: -91 }, angle);
        layer.appendChild(make('use', { href: '#start', x: baseCenter.x, y: baseCenter.y, class: 'player-' + player, transform: 'rotate(' + angle + ' ' + baseCenter.x + ' ' + baseCenter.y + ') scale(.72)' }));
        for (let pos = board.finishStart; pos <= board.finishEnd; pos++) {
            const p = rotate(baseTrack[pos], angle);
            layer.appendChild(make('use', { href: '#vr2', x: p.x, y: p.y, class: 'player-' + player + ' six-finish-cell', 'data-cpos': pos }));
        }
        const endPos = rotate({ x: 0, y: -5 }, angle);
        layer.appendChild(make('use', { href: '#end', x: endPos.x, y: endPos.y, class: 'player-' + player, transform: 'rotate(' + (angle + 180) + ' ' + endPos.x + ' ' + endPos.y + ') scale(.65)' }));

        // 飞行箭头：仍使用原版 arrow 图元；位置由规则中的飞行格决定。
        const fp = rotate(baseTrack[board.flightPoint], angle);
        layer.appendChild(make('use', { href: '#arrow', x: fp.x - 5, y: fp.y - 5, class: 'player-' + player + ' six-flight-arrow', transform: 'rotate(' + angle + ' ' + fp.x + ' ' + fp.y + ')' }));

        for (let i = 0; i < 4; i++) {
            const piece = make('use', { href: '#chess', class: 'player-' + player, 'data-player': player, 'data-chess': i });
            layer.appendChild(piece);
        }
    });
    return board;
}
`;
write('frontend/js/sixPlayerBoardRenderer.js', renderer);

const uiExtension = `function cloneColorOption(container, player) {
    if (!container || container.querySelector('[data-player="' + player + '"]')) return;
    const template = container.querySelector('.color-option');
    if (!template) return;
    const option = template.cloneNode(true);
    option.dataset.player = String(player);
    option.classList.remove('selected', 'disabled', 'occupied');
    const circle = option.querySelector('.color-circle');
    if (circle) circle.className = 'color-circle player-' + player + '-color';
    container.appendChild(option);
}

export function installSixPlayerIndexUI() {
    const containers = [
        document.getElementById('localHumanColorOptions'),
        document.getElementById('colorOptions'),
        document.getElementById('multiplayerColorOptions')
    ].filter(Boolean);
    containers.forEach(container => { cloneColorOption(container, 5); cloneColorOption(container, 6); });

    document.querySelectorAll('.color-options').forEach(container => {
        if (container.querySelector('[data-player="1"]') && container.querySelector('[data-player="4"]')) {
            cloneColorOption(container, 5); cloneColorOption(container, 6);
        }
    });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installSixPlayerIndexUI, { once: true });
else installSixPlayerIndexUI();
`;
write('frontend/js/sixPlayerUi.js', uiExtension);

// ActivePlayerManager 直接改成支持 1..6；实际回合顺序仍由 activePlayers 决定。
write('frontend/js/activePlayerManager.js', `import { SUPPORTED_PLAYERS } from './boards/boardConfig.js';

class ActivePlayerManager {
    constructor() {
        this.activePlayers = [1, 2, 3, 4];
        this.currentActiveIndex = 0;
    }
    setActivePlayers(playerNumbers) {
        if (!Array.isArray(playerNumbers)) return;
        this.activePlayers = playerNumbers.filter((num, index) => SUPPORTED_PLAYERS.includes(Number(num)) && playerNumbers.indexOf(num) === index).map(Number);
        this.currentActiveIndex = 0;
        this.updatePlayerVisibility();
    }
    getActivePlayers() { return [...this.activePlayers]; }
    isPlayerActive(playerNumber) { return this.activePlayers.includes(Number(playerNumber)); }
    getCurrentActivePlayer() { return this.activePlayers[this.currentActiveIndex] ?? 1; }
    getNextActivePlayer() {
        if (!this.activePlayers.length) return 1;
        this.currentActiveIndex = (this.currentActiveIndex + 1) % this.activePlayers.length;
        return this.activePlayers[this.currentActiveIndex];
    }
    setCurrentActivePlayer(playerNumber) {
        const index = this.activePlayers.indexOf(Number(playerNumber));
        if (index !== -1) this.currentActiveIndex = index;
    }
    updatePlayerVisibility() {
        for (const player of SUPPORTED_PLAYERS) {
            const isActive = this.isPlayerActive(player);
            document.querySelectorAll('.player-' + player + '-info').forEach(el => { el.style.display = isActive ? 'flex' : 'none'; el.style.visibility = isActive ? 'visible' : 'hidden'; });
            const progress = document.querySelector('.progress-item[data-player="' + player + '"]');
            if (progress) progress.style.display = isActive ? 'flex' : 'none';
            document.querySelectorAll('#board-svg use[href="#chess"].player-' + player).forEach(el => { el.style.display = isActive ? 'block' : 'none'; });
        }
    }
    getActivePlayerCount() { return this.activePlayers.length; }
    reset() { this.activePlayers = [1,2,3,4]; this.currentActiveIndex = 0; this.updatePlayerVisibility(); }
}
export const activePlayerManager = new ActivePlayerManager();
`);

// gameState: 注入棋盘配置，始终创建 6 个状态槽；四人模式通过 activePlayerManager 隐藏/跳过 5、6。
patch('frontend/js/gameState.js', text => {
  text = replaceOnce(text, "import { activePlayerManager } from './activePlayerManager.js';", "import { activePlayerManager } from './activePlayerManager.js';\nimport { SUPPORTED_PLAYERS, getCurrentBoardDefinition } from './boards/boardConfig.js';");
  text = replaceOnce(text, '        // 游戏基础状态\n', "        this.boardDefinition = getCurrentBoardDefinition();\n        this.maxPlayers = this.boardDefinition.playerCount;\n\n        // 游戏基础状态\n");
  text = text.replaceAll('for (let player = 1; player <= 4; player++)', 'for (const player of SUPPORTED_PLAYERS)');
  text = text.replaceAll('for (let player = 1; player <= 4; player++) {', 'for (const player of SUPPORTED_PLAYERS) {');
  text = replaceOnce(text, '    generateMainTrack() {\n        // 主轨道位置数组，包含所有移动路径', "    generateMainTrack() {\n        if (this.boardDefinition?.id === 'classic6') return this.boardDefinition.createMainTrack();\n        // 主轨道位置数组，包含所有移动路径");
  text = replaceOnce(text, '    // 初始化玩家棋子状态\n    initializePlayerChess(pieceCount) {', `    ensureSupportedPlayerState() {
        const diceTemplate = () => ({ 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 });
        for (const player of SUPPORTED_PLAYERS) {
            this.defeatCounts[player] ||= {};
            for (const opponent of SUPPORTED_PLAYERS) if (opponent !== player) this.defeatCounts[player][opponent] ??= 0;
            this.diceStatistics[player] ||= diceTemplate();
            this.totalDistance[player] ??= 0;
            this.totalEnergyGained[player] ??= 0;
            this.skillUsage[player] ||= { remoteDice:0, teleport:0, polyhedralDice:0, mysteryBox:0 };
            for (const key of ['consecutiveOnes','consecutiveNoTakeoff','maxConsecutiveSixes','bounceSteps','maxTeleportDistance','mysteryBoxMax','polyhedralMax','skillUseCount']) this.titleStats[key][player] ??= 0;
            for (const key of ['mysteryBoxMin','polyhedralMin']) this.titleStats[key][player] ??= 99;
        }
    }

    getBoardDefinition() { return this.boardDefinition || getCurrentBoardDefinition(); }
    getOuterTrackEnd() { return this.getBoardDefinition().outerEnd; }
    getFinishStart() { return this.getBoardDefinition().finishStart; }
    getFinishEnd() { return this.getBoardDefinition().finishEnd; }
    getPlayerRotation(player) { return this.getBoardDefinition().playerAngles[Number(player)] ?? 0; }

    // 初始化玩家棋子状态
    initializePlayerChess(pieceCount) {`);
  // constructor 中 skillUsage 初始化之后补齐 5/6 统计。
  text = text.replace(/(this\.skillUsage\s*=\s*\{[\s\S]*?\n\s*\};)(\n\s*}\n\n\s*\/\/ 初始化玩家棋子状态)/, '$1\n        this.ensureSupportedPlayerState();$2');
  // reset 时重新读取棋盘配置，确保从首页切换到六人局后使用六人坐标。
  text = text.replace(/(resetGameState\s*\([^)]*\)\s*\{)/, `$1\n        this.boardDefinition = getCurrentBoardDefinition();\n        this.maxPlayers = this.boardDefinition.playerCount;\n        this.mainTrack = this.generateMainTrack();\n        this.trackRotations = this.calculateTrackRotations(this.mainTrack);`);
  return text;
});

// utils: 四/六人共用同一组规则函数，差异只来自 boardDefinition。
patch('frontend/js/utils.js', text => {
  text = `import { SUPPORTED_PLAYERS, getCurrentBoardDefinition, getAbsolutePositionForBoard, isJumpPointForBoard, getNextJumpPointForBoard, getOpponentForBoard } from './boards/boardConfig.js';\n` + text;
  text = text.replace(/export function isJumpPoint\(position\) \{[\s\S]*?\n\}/, `export function isJumpPoint(position) { return isJumpPointForBoard(position, getCurrentBoardDefinition()); }`);
  text = text.replace(/export function getNextJumpPoint\(currentPosition\) \{[\s\S]*?\n\}/, `export function getNextJumpPoint(currentPosition) { return getNextJumpPointForBoard(currentPosition, getCurrentBoardDefinition()); }`);
  text = text.replace(/export function getAbsolutePosition\(player, relativePosition\) \{[\s\S]*?\n\}/, `export function getAbsolutePosition(player, relativePosition) { return getAbsolutePositionForBoard(player, relativePosition, getCurrentBoardDefinition()); }`);
  text = text.replace(/export function getOpponentPlayer\(player\) \{[\s\S]*?\n\}/, `export function getOpponentPlayer(player) { return getOpponentForBoard(player, getCurrentBoardDefinition()); }`);
  text = text.replaceAll('for (let player = 1; player <= 4; player++)', 'for (const player of SUPPORTED_PLAYERS)');
  text = text.replaceAll('for (let player = 1; player <= 4 && !targetChess; player++)', 'for (const player of SUPPORTED_PLAYERS) { if (targetChess) break;');
  return text;
});

// 关键模块中只扩玩家扫描范围；未激活玩家状态均在基地，不改变四人局结果。
for (const rel of [
  'frontend/js/chessPiece.js', 'frontend/js/animation.js', 'frontend/js/botController.js',
  'frontend/js/progressDisplay.js', 'frontend/js/defeatCountDisplay.js', 'frontend/js/gameMain.js',
  'frontend/js/energyDisplay.js', 'frontend/js/energyManager.js', 'frontend/js/uiUpdater.js',
  'frontend/js/aiTakeoverManager.js', 'frontend/js/settlementModal.js', 'frontend/js/multiplayerGameManager.js'
]) {
  if (!fs.existsSync(path.join(root, rel))) continue;
  patch(rel, text => text
    .replaceAll('for (let player = 1; player <= 4; player++)', 'for (let player = 1; player <= 6; player++)')
    .replaceAll('for (let p = 1; p <= 4; p++)', 'for (let p = 1; p <= 6; p++)')
    .replaceAll('for (let opponent = 1; opponent <= 4; opponent++)', 'for (let opponent = 1; opponent <= 6; opponent++)'));
}

// chessPiece 的路径边界和飞棋关键位置改为棋盘参数，规则流程本身保持不变。
patch('frontend/js/chessPiece.js', text => {
  text = `import { getCurrentBoardDefinition } from './boards/boardConfig.js';\n` + text;
  text = text.replaceAll('const baseRotations = { 1: 180, 2: 270, 3: 0, 4: 90 };\n            const baseRotation = baseRotations[player];', 'const baseRotation = this.gameState.getPlayerRotation(player);');
  text = text.replaceAll('targetPosition > 56', 'targetPosition > this.gameState.getFinishEnd()');
  text = text.replaceAll('currentPosition < 56', 'currentPosition < this.gameState.getFinishEnd()');
  text = text.replaceAll('56 - currentPosition', 'this.gameState.getFinishEnd() - currentPosition');
  text = text.replaceAll('currentPosition === 56', 'currentPosition === this.gameState.getFinishEnd()');
  text = text.replaceAll('chess.position = 56', 'chess.position = this.gameState.getFinishEnd()');
  text = text.replaceAll('position === 14', "position === getCurrentBoardDefinition().flightPredecessor");
  text = text.replaceAll('position === 18', "position === getCurrentBoardDefinition().flightPoint");
  text = text.replaceAll('animateJump(player, chessIndex, 18)', 'animateJump(player, chessIndex, getCurrentBoardDefinition().flightPoint)');
  text = text.replaceAll('performFlyingChess(player, chessIndex, 30', 'performFlyingChess(player, chessIndex, getCurrentBoardDefinition().flightTarget');
  text = text.replaceAll('animateJump(player, chessIndex, 34)', 'animateJump(player, chessIndex, getCurrentBoardDefinition().flightPostJump)');
  text = text.replaceAll('position53', 'finishCrossPosition');
  text = text.replaceAll('位置53', '终点航道交叉点');
  return text;
});

// dice 使用动态外圈/终点边界。
patch('frontend/js/dice.js', text => text
  .replaceAll('chess.position >= 0 && chess.position <= 50', 'chess.position >= 0 && chess.position <= this.gameState.getOuterTrackEnd()')
  .replaceAll('chess.position >= 51 && chess.position < 56', 'chess.position >= this.gameState.getFinishStart() && chess.position < this.gameState.getFinishEnd()'));

// gameMain 在 setupChessElements 前切换六人 SVG；并让本地/AI配置自动携带 boardId。
patch('frontend/js/gameMain.js', text => {
  text = replaceOnce(text, "import { lightningManager } from './lightningManager.js';", "import { lightningManager } from './lightningManager.js';\nimport { prepareBoardForCurrentMode } from './sixPlayerBoardRenderer.js';\nimport { getCurrentBoardDefinition } from './boards/boardConfig.js';");
  text = replaceOnce(text, '            // 3. 设置棋子元素\n            this.setupChessElements();', '            // 3. 根据配置准备四人/六人棋盘，再设置棋子元素\n            prepareBoardForCurrentMode();\n            this.setupChessElements();');
  text = text.replace('    autoRotateBoard(playerColor) {\n', "    autoRotateBoard(playerColor) {\n        if (getCurrentBoardDefinition().id === 'classic6') { uiUpdater.rotateBoard(0); return; }\n");
  return text;
});

// 首页扩展两种颜色，并在人数>4时选择 classic6；最多6人。
patch('frontend/js/indexMain.js', text => {
  text = `import { installSixPlayerIndexUI } from './sixPlayerUi.js';\n` + text;
  text = text.replace('        this.setupModeSelection();', '        installSixPlayerIndexUI();\n        this.setupModeSelection();');
  text = text.replaceAll('const order = [1, 3, 2, 4];', 'const order = [1, 4, 2, 5, 3, 6];');
  text = text.replaceAll('if (selected.size >= 4) return;', 'if (selected.size >= 6) return;');
  text = text.replaceAll('最多4个', '最多6个');
  text = text.replace(/(const localGameConfig = \{\n\s*mode: 'local_multiplayer',)/, `$1\n            boardId: this.localMultiplayerConfig.playerCount > 4 ? 'classic6' : 'classic4',`);
  text = text.replace(/(const gameConfig = \{\n\s*mode: 'ai_battle',)/, `$1\n            boardId: (1 + this.activeBots.size) > 4 ? 'classic6' : 'classic4',`);
  return text;
});

// HTML 静态补 5/6 颜色入口；其余玩家编辑卡仍由原 JS 动态生成。
patch('frontend/index.html', text => {
  const color4 = `<div class="color-option" data-player="4">\n                                                <div class="color-circle player-4-color"></div>\n                                            </div>`;
  const extra = `${color4}\n                                            <div class="color-option" data-player="5"><div class="color-circle player-5-color"></div></div>\n                                            <div class="color-option" data-player="6"><div class="color-circle player-6-color"></div></div>`;
  if (text.includes(color4) && !text.includes('data-player="6"')) text = text.replace(color4, extra);
  return text;
});

// CSS 只补 5/6 色板和六边形布局，不改原1-4主题。
patch('frontend/css/style.css', text => {
  if (text.includes('--player-5-color')) return text;
  const extra = `\n/* 六人棋盘扩展：沿用原版低饱和度色板 */\n:root {\n  --player-5-color:#c7b9df; --player-5-fill:#e8e0f2; --player-5-stats-bg:#f2edf8; --player-5-border:#ad9bc9;\n  --player-6-color:#d9cf98; --player-6-fill:#eee9c9; --player-6-stats-bg:#f7f3df; --player-6-border:#c1b56f;\n}\n.player-5,.player-5-color{color:var(--player-5-color);stroke:var(--player-5-color);fill:var(--player-5-color);--player-border:var(--player-5-border)}\n.player-6,.player-6-color{color:var(--player-6-color);stroke:var(--player-6-color);fill:var(--player-6-color);--player-border:var(--player-6-border)}\n.color-circle.player-5-color,.emoji-preview.player-5-color{background:var(--player-5-color);border-color:var(--player-5-border)}\n.color-circle.player-6-color,.emoji-preview.player-6-color{background:var(--player-6-color);border-color:var(--player-6-border)}\n.player-5-avatar{background:var(--player-5-color);border:2px solid var(--player-5-border);color:#fff}\n.player-6-avatar{background:var(--player-6-color);border:2px solid var(--player-6-border);color:#fff}\n.player-5-defeat{color:var(--player-5-color)} .player-6-defeat{color:var(--player-6-color)}\nbody.six-player-mode .players-info{width:126%;height:100%}\nbody.six-player-mode .players-info .six-seat-1{top:1%;left:50%;transform:translateX(-50%)}\nbody.six-player-mode .players-info .six-seat-2{top:20%;right:0}\nbody.six-player-mode .players-info .six-seat-3{bottom:16%;right:0}\nbody.six-player-mode .players-info .six-seat-4{bottom:1%;left:50%;transform:translateX(-50%)}\nbody.six-player-mode .players-info .six-seat-5{bottom:16%;left:0}\nbody.six-player-mode .players-info .six-seat-6{top:20%;left:0}\nbody.six-player-mode #board-svg{overflow:visible}\nbody.six-player-mode #board-svg .six-ring-cell,body.six-player-mode #board-svg .six-finish-cell{opacity:.96}\n@media(max-width:768px){body.six-player-mode .players-top,body.six-player-mode .players-bottom{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;width:100%}body.six-player-mode .players-top .player-info,body.six-player-mode .players-bottom .player-info{position:static;transform:none;width:auto;justify-content:center}}\n`;
  return text + extra;
});

// 联机前端：颜色/容量 6；大于4自动 classic6。
patch('frontend/js/multiplayerManager.js', text => {
  text = text.replaceAll('[1, 2, 3, 4]', '[1, 2, 3, 4, 5, 6]');
  text = text.replaceAll('maxPlayers: 4', 'maxPlayers: 6');
  text = text.replaceAll('maxPlayers = 4', 'maxPlayers = 6');
  text = text.replaceAll('<= 4', '<= 6');
  text = text.replace(/settings:\s*\{([^}]*)pieceCount:/g, (m, p1) => `settings: {${p1}boardId: (this.currentRoom?.settings?.maxPlayers || 4) > 4 ? 'classic6' : 'classic4',\n                        pieceCount:`);
  return text;
});

// 后端房间与颜色上限扩到6；房间配置携带 boardId。
patch('backend/server.cjs', text => {
  text = text.replaceAll('maxPlayers: 4', 'maxPlayers: 6');
  text = text.replaceAll('maxPlayers = 4', 'maxPlayers = 6');
  text = text.replaceAll('[1, 2, 3, 4]', '[1, 2, 3, 4, 5, 6]');
  text = text.replaceAll('<= 4', '<= 6');
  text = text.replaceAll('Math.min(4,', 'Math.min(6,');
  // 服务端已有 settings 时补 boardId，客户端可据此选择棋盘。
  text = text.replace(/(maxPlayers:\s*[^,\n]+,)/g, `$1\n                boardId: Number(maxPlayers) > 4 ? 'classic6' : 'classic4',`);
  return text;
});

// 进度/击败面板显式支持 5/6 DOM 缺失时安全跳过。
for (const rel of ['frontend/js/progressDisplay.js','frontend/js/defeatCountDisplay.js']) {
  patch(rel, text => text.replaceAll('[1, 2, 3, 4]', '[1, 2, 3, 4, 5, 6]').replaceAll('<= 4', '<= 6'));
}

// 新增棋盘拓扑回归测试。
write('frontend/js/boards/classic6.test.mjs', `import assert from 'node:assert/strict';\nimport { getBoardDefinition, getAbsolutePositionForBoard, isJumpPointForBoard, getOpponentForBoard } from './boardConfig.js';\nconst b = getBoardDefinition('classic6');\nassert.equal(b.playerCount, 6);\nassert.equal(b.ringLength, 78);\nassert.equal(b.outerEnd, 76);\nassert.equal(b.finishStart, 77);\nassert.equal(b.finishEnd, 82);\nassert.deepEqual(b.players, [1,2,3,4,5,6]);\nassert.equal(getOpponentForBoard(1,b),4); assert.equal(getOpponentForBoard(2,b),5); assert.equal(getOpponentForBoard(3,b),6);\nassert.equal(getAbsolutePositionForBoard(2,1,b),14); assert.equal(getAbsolutePositionForBoard(6,1,b),66);\nassert.equal(isJumpPointForBoard(2,b),true); assert.equal(isJumpPointForBoard(8,b),true); assert.equal(isJumpPointForBoard(6,b),false);\nassert.equal(b.flightPredecessor,20); assert.equal(b.flightPoint,26); assert.equal(b.flightTarget,68); assert.equal(b.flightPostJump,74);\nassert.equal(b.createMainTrack().length,83);\nconsole.log('classic6 board tests passed');\n`);

patch('frontend/package.json', text => {
  const pkg = JSON.parse(text);
  pkg.scripts['test:six-player'] = 'node js/boards/classic6.test.mjs';
  return JSON.stringify(pkg, null, 2) + '\n';
});

console.log('six-player source migration complete');
