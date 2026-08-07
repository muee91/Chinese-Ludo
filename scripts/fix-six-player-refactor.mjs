import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const write = (file, text) => fs.writeFileSync(file, text);
const patch = (file, fn) => write(file, fn(read(file)));
const once = (text, from, to, label = from) => {
  if (!text.includes(from)) {
    console.warn(`[fixup] pattern already changed or missing in ${label}`);
    return text;
  }
  return text.replace(from, to);
};

// ---------------- GameState: 6-player state slots + board geometry ----------------
patch('frontend/js/gameState.js', text => {
  text = once(text,
`        // 初始化玩家棋子状态（默认4个棋子）
        this.initializePlayerChess(4);`,
`        // 六人棋盘继续使用原 GameState；仅根据棋盘定义切换几何坐标。
        this.applyBoardStartPositions();
        // 初始化玩家棋子状态（默认4个棋子）
        this.initializePlayerChess(4);`, 'gameState constructor start positions');

  if (!text.includes('applyBoardStartPositions() {')) {
    text = once(text,
`    ensureSupportedPlayerState() {`,
`    applyBoardStartPositions() {
        const board = this.getBoardDefinition();
        if (board.id === 'classic6') {
            const slots = board.getBaseSlotPositions();
            for (const player of SUPPORTED_PLAYERS) {
                this.startPositions[player] = slots.map(point => ({ ...point }));
            }
            return;
        }
        // classic4 保持原坐标；5/6 仅作为未激活的兼容状态槽。
        const fallback = this.startPositions[3] || this.startPositions[1] || [];
        for (const player of [5, 6]) {
            this.startPositions[player] = fallback.map(point => ({ ...point }));
        }
    }

    ensureSupportedPlayerState() {`, 'gameState applyBoardStartPositions');
  }

  // Constructor stats are initially written with 1..4 to preserve original structure; expand them after all maps exist.
  text = text.replace(/(this\.skillUsage = \{[\s\S]*?\n        \};)(\n    \}\n\n    applyBoardStartPositions\(\))/,
    '$1\n        this.ensureSupportedPlayerState();$2');

  text = once(text,
`        this.trackRotations = this.calculateTrackRotations(this.mainTrack);
        // 清除思考时间计时器`,
`        this.trackRotations = this.calculateTrackRotations(this.mainTrack);
        this.applyBoardStartPositions();
        // 清除思考时间计时器`, 'reset board geometry');

  text = text.replaceAll('for (let opponent = 1; opponent <= 4; opponent++)', 'for (let opponent = 1; opponent <= 6; opponent++)');

  // Expand reset-time stats after recreating their original maps.
  text = text.replace(/(this\.skillUsage = \{\n            1:[\s\S]*?\n        \};)(\n    \}\n\n    \/\/ 记录首位完成者)/,
    '$1\n        this.ensureSupportedPlayerState();$2');

  text = text.replace('                if (diceValue === 6) {', '                if (diceValue % 2 === 0) {');
  text = once(text,
`    getFinishEnd() { return this.getBoardDefinition().finishEnd; }
    getPlayerRotation(player) { return this.getBoardDefinition().playerAngles[Number(player)] ?? 0; }`,
`    getFinishEnd() { return this.getBoardDefinition().finishEnd; }
    getFlightCrossPosition() { return this.getBoardDefinition().getFlightCrossPosition(); }
    getPlayerRotation(player) { return this.getBoardDefinition().playerAngles[Number(player)] ?? 0; }`, 'board getters');
  return text;
});

// ---------------- Utils: retain original collision/stack functions, parameterize the board ----------------
patch('frontend/js/utils.js', text => {
  text = text.replace(
    "import { SUPPORTED_PLAYERS, getCurrentBoardDefinition, getAbsolutePositionForBoard, isJumpPointForBoard, getNextJumpPointForBoard, getOpponentForBoard } from './boards/boardConfig.js';",
    "import { SUPPORTED_PLAYERS, getCurrentBoardDefinition, getAbsolutePositionForBoard, isJumpPointForBoard, getNextJumpPointForBoard, getOpponentForBoard, getFlightCrossPositionForBoard } from './boards/boardConfig.js';"
  );

  text = text.replace(/export function getChessRotationAtPosition\(position\) \{[\s\S]*?^\}/m,
`export function getChessRotationAtPosition(playerOrPosition, maybePosition = null, gameState = null) {
    const position = Number(maybePosition === null ? playerOrPosition : maybePosition);
    const board = gameState?.getBoardDefinition?.() || getCurrentBoardDefinition();
    if (board.id === 'classic6') {
        const track = board.createMainTrack();
        const clamp = value => Math.max(1, Math.min(board.finishEnd, value));
        const heading = pos => {
            const p = clamp(pos);
            const before = track[Math.max(1, p - 1)] || track[p];
            const after = track[Math.min(board.finishEnd, p + 1)] || track[p];
            return Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI;
        };
        const base = heading(1);
        let result = heading(position) - base;
        while (result > 180) result -= 360;
        while (result < -180) result += 360;
        return result;
    }

    // classic4 原始转向表保持不变。
    const specificRotations = {
        1: -90, 5: -90, 8: 90, 14: 90, 19: -90, 21: 90,
        27: 90, 30: -90, 34: 90, 40: 90, 44: -90, 47: 90, 50: 90
    };
    let totalRotation = 0;
    for (let pos = 1; pos <= position; pos++) {
        if (Object.prototype.hasOwnProperty.call(specificRotations, pos)) totalRotation += specificRotations[pos];
    }
    return totalRotation;
}`);

  text = text.replace(/export function calculateChessProgress\(chess, player\) \{[\s\S]*?^\}/m,
`export function calculateChessProgress(chess, player) {
    if (chess.finished) return 100;
    if (chess.position === -1) return 0;
    const board = getCurrentBoardDefinition();
    const totalSteps = board.finishEnd + 1;
    return Math.min(100, Math.max(0, (chess.position / totalSteps) * 100));
}`);

  text = text.replace(/export function hasChessAtPosition53\(player, gameState = null\) \{[\s\S]*?^\}/m,
`export function hasChessAtPosition53(player, gameState = null) {
    if (!gameState) return { hasChess: false };
    const crossPosition = getFlightCrossPositionForBoard(gameState.getBoardDefinition?.() || getCurrentBoardDefinition());
    const playerChess = gameState.getPlayerChess ? gameState.getPlayerChess() : gameState.playerChess;
    const pieceCount = gameState.pieceCount || 4;
    for (let chessIndex = 0; chessIndex < pieceCount; chessIndex++) {
        const chess = playerChess[player]?.[chessIndex];
        if (chess && !chess.finished && chess.position === crossPosition) return { hasChess: true, chessIndex, chess };
    }
    return { hasChess: false };
}`);

  text = text.replace(/export function hasOpponentStackAtPosition53\(currentPlayer, gameState\) \{[\s\S]*?^\}/m,
`export function hasOpponentStackAtPosition53(currentPlayer, gameState) {
    const board = gameState?.getBoardDefinition?.() || getCurrentBoardDefinition();
    const opponentPlayer = getOpponentPlayer(currentPlayer);
    if (!opponentPlayer) return { hasStack: false, stackInfo: null };
    const crossPosition = getFlightCrossPositionForBoard(board);
    const absolutePosition = getAbsolutePosition(opponentPlayer, crossPosition);
    const stackInfo = isStackAtAbsolutePosition(absolutePosition, gameState);
    if (stackInfo && stackInfo.chessList.length >= 2 && stackInfo.chessList.every(item => item.player === opponentPlayer)) {
        return { hasStack: true, stackInfo };
    }
    return { hasStack: false, stackInfo: null };
}`);

  text = text.replace('if (currentPosition < 0 || (currentPosition >= 51 && currentPosition !== 0))', 'if (currentPosition < 0 || (currentPosition >= getCurrentBoardDefinition().finishStart && currentPosition !== 0))');
  text = text.replace('if (nextPosition <= 0 || nextPosition > 50)', 'if (nextPosition <= 0 || nextPosition > getCurrentBoardDefinition().outerEnd)');
  return text;
});

// ---------------- Animation: p5/p6 rotations and dynamic finish lane ----------------
patch('frontend/js/animation.js', text => {
  text = text.replace(/const rotations = \{ 1: 180, 2: 270, 3: 0, 4: 90 \};\n\s*const baseRotation = rotations\[player\];/g,
    'const baseRotation = this.gameState.getPlayerRotation(player);');
  text = text.replace(/const baseRotations = \{ 1: 180, 2: 270, 3: 0, 4: 90 \};\n\s*const baseRotation = baseRotations\[player\];/g,
    'const baseRotation = this.gameState.getPlayerRotation(player);');
  text = text.replace('const isFinishLane = chess.position >= 51 && chess.position <= 56;',
    'const isFinishLane = chess.position >= this.gameState.getFinishStart() && chess.position <= this.gameState.getFinishEnd();');
  text = text.replace('const shouldHighlightStack = chess.position !== 0 && (!isFinishLane || chess.position === 53);',
    'const shouldHighlightStack = chess.position !== 0 && (!isFinishLane || chess.position === this.gameState.getFlightCrossPosition());');
  return text;
});

// ---------------- ChessPiece: special positions remain original flow, values come from board ----------------
patch('frontend/js/chessPiece.js', text => {
  text = text.replaceAll('for (let pos = 1; pos <= 50; pos++)', 'for (let pos = 1; pos <= this.gameState.getOuterTrackEnd(); pos++)');
  text = text.replaceAll('otherChess.position >= 51', 'otherChess.position >= this.gameState.getFinishStart()');
  text = text.replaceAll('actualFinalPosition <= 51', 'actualFinalPosition < this.gameState.getFinishStart()');
  text = text.replaceAll('targetPosition <= 51', 'targetPosition < this.gameState.getFinishStart()');
  text = text.replaceAll('targetPosition !== 56', 'targetPosition !== this.gameState.getFinishEnd()');
  text = text.replaceAll('nextPos > 56', 'nextPos > this.gameState.getFinishEnd()');
  text = text.replaceAll("gameInfo.addChessMove(player, chessIndex, 'move', pos, 56);", "gameInfo.addChessMove(player, chessIndex, 'move', pos, this.gameState.getFinishEnd());");
  text = text.replaceAll('newPosition > 56', 'newPosition > this.gameState.getFinishEnd()');
  text = text.replaceAll('newPosition = 56', 'newPosition = this.gameState.getFinishEnd()');
  text = text.replaceAll('newPosition === 56', 'newPosition === this.gameState.getFinishEnd()');
  text = text.replaceAll('chess.position === 56', 'chess.position === this.gameState.getFinishEnd()');
  text = text.replaceAll('this.generateUniqueLastLandPos(56)', 'this.generateUniqueLastLandPos(this.gameState.getFinishEnd())');

  text = text.replace('this.checkStackFormation(player, 18);', 'this.checkStackFormation(player, getCurrentBoardDefinition().flightPoint);');
  text = text.replace('const position18AbsolutePosition = this.utils.getAbsolutePosition(player, 18);', 'const flightPointAbsolutePosition = this.utils.getAbsolutePosition(player, getCurrentBoardDefinition().flightPoint);');
  text = text.replaceAll('position18AbsolutePosition', 'flightPointAbsolutePosition');
  text = text.replace('await this.animation.animateJump(player, chessIndex, 22);', 'await this.animation.animateJump(player, chessIndex, this.utils.getNextJumpPoint(getCurrentBoardDefinition().flightPoint));');
  text = text.replace('if (chess.position === 22) {\n                    this.checkStackFormation(player, 22);', 'if (chess.position === this.utils.getNextJumpPoint(getCurrentBoardDefinition().flightPoint)) {\n                    this.checkStackFormation(player, chess.position);');
  text = text.replace('if (chess.position === 30) {', 'if (chess.position === getCurrentBoardDefinition().flightTarget) {');

  text = text.replace('const opponentChessAt53 = this.utils.hasChessAtPosition53(opponentPlayer, this.gameState);',
    'const opponentChessAt53 = this.utils.hasChessAtPosition53(opponentPlayer, this.gameState);\n            const flightCrossPosition = this.gameState.getFlightCrossPosition();');
  text = text.replace('const beatAbsolutePosition = this.utils.getAbsolutePosition(opponentPlayer, 53);',
    'const beatAbsolutePosition = this.utils.getAbsolutePosition(opponentPlayer, flightCrossPosition);');
  return text;
});

// ---------------- Progress / defeat displays: lazy-bind dynamically added p5/p6 elements ----------------
patch('frontend/js/progressDisplay.js', text => {
  text = text.replace('const chessProgress = Math.min((chess.position / 56) * progressPerPiece, progressPerPiece);',
    'const chessProgress = Math.min((chess.position / gameState.getFinishEnd()) * progressPerPiece, progressPerPiece);');
  text = once(text,
`    updatePlayerProgress(player, progress) {
        const item = this.progressItems[player];
        if (!item) return;`,
`    updatePlayerProgress(player, progress) {
        if (!this.progressItems[player] && this.progressContent) {
            const element = this.progressContent.querySelector(\`[data-player="\${player}"]\`);
            if (element) this.progressItems[player] = { element, fillElement: element.querySelector('.progress-fill') };
        }
        const item = this.progressItems[player];
        if (!item || !item.fillElement) return;`, 'progress lazy bind');
  return text;
});

patch('frontend/js/defeatCountDisplay.js', text => {
  text = once(text,
`    updateDefeatCount(attackerPlayer, defeatedPlayer, count) {
        const element = this.defeatCountElements[attackerPlayer]?.[defeatedPlayer];`,
`    updateDefeatCount(attackerPlayer, defeatedPlayer, count) {
        let element = this.defeatCountElements[attackerPlayer]?.[defeatedPlayer];
        if (!element) {
            this.initializeElements();
            element = this.defeatCountElements[attackerPlayer]?.[defeatedPlayer];
        }`, 'defeat lazy bind');
  return text;
});

// ---------------- Names / game setup ----------------
patch('frontend/js/playerNameManager.js', text => {
  text = text.replace("            4: '玩家4'", "            4: '玩家4',\n            5: '玩家5',\n            6: '玩家6'");
  text = text.replaceAll('playerNumber <= 4', 'playerNumber <= 6');
  text = text.replaceAll('playerNumber >= 1 && playerNumber <= 4', 'playerNumber >= 1 && playerNumber <= 6');
  return text;
});

patch('frontend/js/gameMain.js', text => {
  text = text.replaceAll('for (let i = 1; i <= 4; i++)', 'for (let i = 1; i <= 6; i++)');
  text = text.replaceAll('activeBotNumbers || [1, 2, 3, 4].filter', 'activeBotNumbers || [1, 2, 3, 4, 5, 6].filter');
  return text;
});

patch('frontend/js/energyManager.js', text => {
  text = once(text,
`        this.playerEnergy = {
            1: 0,
            2: 0,
            3: 0,
            4: 0
        };`,
`        this.playerEnergy = {
            1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0
        };`, 'energy players');
  return text;
});

patch('frontend/js/energyDisplay.js', text => {
  text = text.replace('if (player === 1 || player === 4) {', 'if (player === 1 || player === 4 || player === 6) {');
  text = text.replace("} else if (player === 2) {", "} else if (player === 2 || player === 5) {");
  text = text.replace('document.querySelector(`.players-bottom .player-2-info`)', 'document.querySelector(`.players-bottom .player-${player}-info`)');
  return text;
});

console.log('comprehensive six-player original-engine fixups applied');
