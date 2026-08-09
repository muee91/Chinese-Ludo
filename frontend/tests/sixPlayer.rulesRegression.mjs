import { chromium } from 'playwright';

const baseUrl = process.env.SIX_PLAYER_PREVIEW_URL || 'http://127.0.0.1:4173';
const config = {
  mode: 'local_multiplayer',
  boardId: 'classic6',
  playerCount: 6,
  pieceCount: 4,
  skillMode: false,
  happyMode: false,
  players: Array.from({ length: 6 }, (_, index) => ({
    id: index + 1,
    name: `规则玩家${index + 1}`,
    isAI: false
  }))
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();
page.on('pageerror', error => console.error('[pageerror]', error.message));

await page.addInitScript(value => {
  sessionStorage.clear();
  sessionStorage.setItem('gameConfig', JSON.stringify(value));
}, config);
await page.goto(`${baseUrl}/game.html`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('body.six-player-mode #classic6-board-layer', { timeout: 15000 });
await page.waitForFunction(() => window.gameInstance?.chessPiece && window.activePlayerManager, null, { timeout: 15000 });
await page.evaluate(() => window.audioManager?.mute?.());

async function resetScenario(currentPlayer = 5, happyMode = false) {
  await page.evaluate(({ currentPlayer, happyMode }) => {
    const game = window.gameInstance;
    const gs = game.gameState;
    window.activePlayerManager.setActivePlayers([1, 2, 3, 4, 5, 6]);
    window.activePlayerManager.setCurrentActivePlayer(currentPlayer);
    gs.setCurrentPlayer(currentPlayer);
    gs.setHappyMode(happyMode);
    gs.setIsLocalMultiplayer(true);
    gs.setIsOnlineMultiplayer(false);
    gs.setGamePhase('rolling');
    gs.setIsRolling(false);
    gs.setDiceValue(0);
    gs.setWinner(null);
    gs.setConsecutiveSixes(0);
    gs.setCanReroll(false);
    gs.justRolledSix = false;
    gs.isRemoteDice = false;
    gs.setChessMoving(false);
    gs.selectedChess = null;
    gs.isThreeSixesPenaltyActive = false;
    game.chessPiece.clearClickDebounce();
    game.chessPiece._currentMoveBeatenChesses = [];
    for (let player = 1; player <= 6; player++) {
      for (let index = 0; index < gs.pieceCount; index++) {
        const chess = gs.playerChess[player][index];
        chess.position = -1;
        chess.finished = false;
        chess.lastLandPos = -1;
        game.animation.updateChessPosition(player, index, null, false);
      }
    }
  }, { currentPlayer, happyMode });
}

async function waitMovementDone(timeout = 12000) {
  await page.waitForFunction(() => !window.gameInstance.gameState.chessMoving, null, { timeout });
}

const topology = await page.evaluate(() => {
  const game = window.gameInstance;
  const board = game.gameState.getBoardDefinition();
  return {
    boardId: board.id,
    predecessor: board.flightPredecessor,
    flightPoint: board.flightPoint,
    target: board.flightTarget,
    postJump: board.flightPostJump,
    cross: board.getFlightCrossPosition(),
    opponentOf5: game.utils.getOpponentPlayer(5),
    finishStart: game.gameState.getFinishStart(),
    finishEnd: game.gameState.getFinishEnd()
  };
});
assert(JSON.stringify(topology) === JSON.stringify({
  boardId: 'classic6', predecessor: 20, flightPoint: 26, target: 50,
  postJump: 56, cross: 79, opponentOf5: 2, finishStart: 77, finishEnd: 82
}), `classic6 topology changed: ${JSON.stringify(topology)}`);

// 1) 遥控骰子 6：可以按 6 移动/起飞，但不产生连投奖励，也不累计连续 6。
await resetScenario(5, false);
const remoteSix = await page.evaluate(async () => {
  const game = window.gameInstance;
  const gs = game.gameState;
  gs.isRemoteDice = true;
  await game.dice.debugRollDice(6);
  return {
    phase: gs.getGamePhase(),
    currentPlayer: gs.getCurrentPlayer(),
    canReroll: gs.getCanReroll(),
    consecutiveSixes: gs.getConsecutiveSixes(),
    justRolledSix: gs.justRolledSix,
    movable: game.uiUpdater.canChessMove(5, 0, 6)
  };
});
assert(remoteSix.phase === 'selecting' && remoteSix.currentPlayer === 5 && remoteSix.movable,
  `remote 6 should allow selection: ${JSON.stringify(remoteSix)}`);
assert(remoteSix.canReroll === false && remoteSix.consecutiveSixes === 0 && remoteSix.justRolledSix === false,
  `remote 6 must not reroll/count: ${JSON.stringify(remoteSix)}`);

// 2) 普通模式第三个连续 6：当前玩家所有未完成、已出发棋子回基地；完成棋子不受影响；轮到下一家。
await resetScenario(5, false);
await page.evaluate(() => {
  const game = window.gameInstance;
  const gs = game.gameState;
  gs.playerChess[5][0].position = 10;
  gs.playerChess[5][1].position = 79;
  gs.playerChess[5][2].position = 82;
  gs.playerChess[5][2].finished = true;
  gs.setConsecutiveSixes(2);
  game.animation.updateChessPosition(5, 0, null, false);
  game.animation.updateChessPosition(5, 1, null, false);
});
await page.evaluate(async () => window.gameInstance.dice.debugRollDice(6));
await page.waitForFunction(() => {
  const gs = window.gameInstance.gameState;
  return gs.getCurrentPlayer() === 6 && !gs.getIsRolling() && !gs.isThreeSixesPenaltyActive;
}, null, { timeout: 6000 });
const thirdSix = await page.evaluate(() => {
  const gs = window.gameInstance.gameState;
  return {
    positions: gs.playerChess[5].map(chess => chess.position),
    finished: gs.playerChess[5].map(chess => chess.finished),
    currentPlayer: gs.getCurrentPlayer(),
    consecutiveSixes: gs.getConsecutiveSixes(),
    canReroll: gs.getCanReroll()
  };
});
assert(thirdSix.positions[0] === -1 && thirdSix.positions[1] === -1,
  `third-six penalty must return active pieces: ${JSON.stringify(thirdSix)}`);
assert(thirdSix.positions[2] === 82 && thirdSix.finished[2] === true,
  `third-six penalty must preserve finished piece: ${JSON.stringify(thirdSix)}`);
assert(thirdSix.currentPlayer === 6 && thirdSix.consecutiveSixes === 0 && thirdSix.canReroll === false,
  `third-six penalty turn/reset invalid: ${JSON.stringify(thirdSix)}`);

// 3) 欢乐模式第三个连续 6：跳过惩罚，棋子不回基地，并保留连投奖励。
await resetScenario(5, true);
await page.evaluate(() => {
  const game = window.gameInstance;
  const gs = game.gameState;
  gs.playerChess[5][0].position = 10;
  gs.setConsecutiveSixes(2);
  game.animation.updateChessPosition(5, 0, null, false);
});
await page.evaluate(async () => window.gameInstance.dice.debugRollDice(6));
await page.waitForFunction(() => window.gameInstance.gameState.getGamePhase() === 'selecting');
const happyThirdSix = await page.evaluate(() => {
  const gs = window.gameInstance.gameState;
  return {
    position: gs.playerChess[5][0].position,
    currentPlayer: gs.getCurrentPlayer(),
    consecutiveSixes: gs.getConsecutiveSixes(),
    canReroll: gs.getCanReroll(),
    justRolledSix: gs.justRolledSix
  };
});
assert(happyThirdSix.position === 10 && happyThirdSix.currentPlayer === 5,
  `happy third 6 must not punish/switch: ${JSON.stringify(happyThirdSix)}`);
assert(happyThirdSix.consecutiveSixes === 0 && happyThirdSix.canReroll && happyThirdSix.justRolledSix,
  `happy third 6 reroll state invalid: ${JSON.stringify(happyThirdSix)}`);

// 4) 飞行前置格 20：无阻挡时 20→26→50，并停在 50（不追加 56）。
await resetScenario(5, false);
const predecessorFlight = await page.evaluate(async () => {
  const game = window.gameInstance;
  const chess = game.gameState.playerChess[5][0];
  chess.position = 20;
  chess.lastLandPos = 1;
  game.animation.updateChessPosition(5, 0, null, false);
  await game.chessPiece.handleSpecialPositions(5, 0, 20);
  return chess.position;
});
assert(predecessorFlight === 50, `predecessor flight should stop at 50, got ${predecessorFlight}`);

// 5) 直接落在飞行格 26：26→50 后继续同色跳到 56。
await resetScenario(5, false);
const directFlight = await page.evaluate(async () => {
  const game = window.gameInstance;
  const chess = game.gameState.playerChess[5][0];
  chess.position = 26;
  chess.lastLandPos = 1;
  game.animation.updateChessPosition(5, 0, null, false);
  await game.chessPiece.handleSpecialPositions(5, 0, 26);
  return chess.position;
});
assert(directFlight === 56, `direct flight should end at 56, got ${directFlight}`);

// 6) 同色叠子位于 26→50 捷径路径：标准模式必须取消飞行，降级为普通跳 26→32。
await resetScenario(5, false);
const sameColorFlightBlock = await page.evaluate(async () => {
  const game = window.gameInstance;
  const gs = game.gameState;
  gs.playerChess[5][0].position = 26;
  gs.playerChess[5][1].position = 30;
  gs.playerChess[5][2].position = 30;
  for (const index of [0, 1, 2]) {
    gs.playerChess[5][index].lastLandPos = index + 1;
    game.animation.updateChessPosition(5, index, null, false);
  }
  const pathStack = game.utils.checkStackInFlightPath(5, 26, 50, gs);
  await game.chessPiece.handleSpecialPositions(5, 0, 26);
  return {
    pathStack: pathStack?.stackPosition || null,
    mover: gs.playerChess[5][0].position,
    blockers: [gs.playerChess[5][1].position, gs.playerChess[5][2].position]
  };
});
assert(sameColorFlightBlock.pathStack === 30 && sameColorFlightBlock.mover === 32 && sameColorFlightBlock.blockers.every(position => position === 30),
  `same-color flight block must degrade to jump: ${JSON.stringify(sameColorFlightBlock)}`);

// 7) 对家 P2 在交叉格 79 形成叠机：P5 直接落 26 时飞行被阻挡，降级为普通跳 26→32。
await resetScenario(5, false);
const blockedDirectFlight = await page.evaluate(async () => {
  const game = window.gameInstance;
  const gs = game.gameState;
  gs.playerChess[5][0].position = 26;
  gs.playerChess[5][0].lastLandPos = 1;
  gs.playerChess[2][0].position = 79;
  gs.playerChess[2][1].position = 79;
  gs.playerChess[2][0].lastLandPos = 1;
  gs.playerChess[2][1].lastLandPos = 2;
  game.animation.updateChessPosition(5, 0, null, false);
  game.animation.updateChessPosition(2, 0, null, false);
  game.animation.updateChessPosition(2, 1, null, false);
  await game.chessPiece.handleSpecialPositions(5, 0, 26);
  return {
    mover: gs.playerChess[5][0].position,
    blockers: [gs.playerChess[2][0].position, gs.playerChess[2][1].position]
  };
});
assert(blockedDirectFlight.mover === 32 && blockedDirectFlight.blockers.every(position => position === 79),
  `blocked direct flight must degrade to jump: ${JSON.stringify(blockedDirectFlight)}`);

// 8) 前置格 20 遇到同一交叉叠机：只做普通跳 20→26，不执行飞行。
await resetScenario(5, false);
const blockedPredecessor = await page.evaluate(async () => {
  const game = window.gameInstance;
  const gs = game.gameState;
  gs.playerChess[5][0].position = 20;
  gs.playerChess[2][0].position = 79;
  gs.playerChess[2][1].position = 79;
  game.animation.updateChessPosition(5, 0, null, false);
  game.animation.updateChessPosition(2, 0, null, false);
  game.animation.updateChessPosition(2, 1, null, false);
  await game.chessPiece.handleSpecialPositions(5, 0, 20);
  return gs.playerChess[5][0].position;
});
assert(blockedPredecessor === 26, `blocked predecessor should stop at 26, got ${blockedPredecessor}`);

// 9) 欢乐模式忽略叠机阻挡与 beat：P5 仍 26→50→56，P2 两枚棋子保留在 79。
await resetScenario(5, true);
const happyFlight = await page.evaluate(async () => {
  const game = window.gameInstance;
  const gs = game.gameState;
  gs.playerChess[5][0].position = 26;
  gs.playerChess[2][0].position = 79;
  gs.playerChess[2][1].position = 79;
  game.animation.updateChessPosition(5, 0, null, false);
  game.animation.updateChessPosition(2, 0, null, false);
  game.animation.updateChessPosition(2, 1, null, false);
  await game.chessPiece.handleSpecialPositions(5, 0, 26);
  return {
    mover: gs.playerChess[5][0].position,
    blockers: [gs.playerChess[2][0].position, gs.playerChess[2][1].position]
  };
});
assert(happyFlight.mover === 56 && happyFlight.blockers.every(position => position === 79),
  `happy mode should ignore flight blocking/beat: ${JSON.stringify(happyFlight)}`);

// 10) 终点必须精确到达：80 + 2 => 完成于 82。
await resetScenario(5, false);
await page.evaluate(async () => {
  const game = window.gameInstance;
  const gs = game.gameState;
  gs.playerChess[5][0].position = 80;
  gs.playerChess[5][0].lastLandPos = 1;
  game.animation.updateChessPosition(5, 0, null, false);
  await game.chessPiece.animateChessMovement(5, 0, 2);
});
await waitMovementDone();
const exactFinish = await page.evaluate(() => {
  const chess = window.gameInstance.gameState.playerChess[5][0];
  return { position: chess.position, finished: chess.finished };
});
assert(exactFinish.position === 82 && exactFinish.finished === true,
  `exact finish failed: ${JSON.stringify(exactFinish)}`);

// 10) 超过终点按原规则反弹：80 + 4 => 到 82 后退 2，最终回到 80，未完成。
await resetScenario(5, false);
await page.evaluate(async () => {
  const game = window.gameInstance;
  const gs = game.gameState;
  gs.playerChess[5][0].position = 80;
  gs.playerChess[5][0].lastLandPos = 1;
  game.animation.updateChessPosition(5, 0, null, false);
  await game.chessPiece.animateChessMovement(5, 0, 4);
});
await waitMovementDone();
const overshoot = await page.evaluate(() => {
  const chess = window.gameInstance.gameState.playerChess[5][0];
  return { position: chess.position, finished: chess.finished };
});
assert(overshoot.position === 80 && overshoot.finished === false,
  `finish overshoot must bounce to 80: ${JSON.stringify(overshoot)}`);

// 11) 普通共享外环撞单机：P5 从 0 走 3，P6 在同一绝对格的单棋被撞回基地。
await resetScenario(5, false);
const singleCollisionSetup = await page.evaluate(() => {
  const game = window.gameInstance;
  const gs = game.gameState;
  const targetAbs = game.utils.getAbsolutePosition(5, 3);
  let p6Relative = null;
  for (let position = 0; position <= gs.getOuterTrackEnd(); position++) {
    if (game.utils.getAbsolutePosition(6, position) === targetAbs) {
      p6Relative = position;
      break;
    }
  }
  if (p6Relative == null) throw new Error('unable to map P6 collision relative position');
  gs.playerChess[5][0].position = 0;
  gs.playerChess[6][0].position = p6Relative;
  game.animation.updateChessPosition(5, 0, null, false);
  game.animation.updateChessPosition(6, 0, null, false);
  return { targetAbs, p6Relative };
});
await page.evaluate(async () => window.gameInstance.chessPiece.animateChessMovement(5, 0, 3));
await waitMovementDone();
await page.waitForTimeout(500);
const singleCollision = await page.evaluate(() => {
  const gs = window.gameInstance.gameState;
  return { mover: gs.playerChess[5][0].position, victim: gs.playerChess[6][0].position };
});
assert(singleCollision.mover === 3 && singleCollision.victim === -1,
  `single collision failed setup=${JSON.stringify(singleCollisionSetup)} result=${JSON.stringify(singleCollision)}`);

// 12) 同一共享格是敌方叠机时，精确撞上按原规则双方全部回基地。
await resetScenario(5, false);
const stackCollisionSetup = await page.evaluate(() => {
  const game = window.gameInstance;
  const gs = game.gameState;
  const targetAbs = game.utils.getAbsolutePosition(5, 3);
  let p6Relative = null;
  for (let position = 0; position <= gs.getOuterTrackEnd(); position++) {
    if (game.utils.getAbsolutePosition(6, position) === targetAbs) {
      p6Relative = position;
      break;
    }
  }
  if (p6Relative == null) throw new Error('unable to map P6 stack relative position');
  gs.playerChess[5][0].position = 0;
  gs.playerChess[6][0].position = p6Relative;
  gs.playerChess[6][1].position = p6Relative;
  gs.playerChess[6][0].lastLandPos = 1;
  gs.playerChess[6][1].lastLandPos = 2;
  game.animation.updateChessPosition(5, 0, null, false);
  game.animation.updateChessPosition(6, 0, null, false);
  game.animation.updateChessPosition(6, 1, null, false);
  return { targetAbs, p6Relative };
});
await page.evaluate(async () => window.gameInstance.chessPiece.animateChessMovement(5, 0, 3));
await page.waitForFunction(() => {
  const gs = window.gameInstance.gameState;
  return gs.playerChess[5][0].position === -1 &&
    gs.playerChess[6][0].position === -1 && gs.playerChess[6][1].position === -1;
}, null, { timeout: 8000 });
const stackCollision = await page.evaluate(() => {
  const gs = window.gameInstance.gameState;
  return {
    mover: gs.playerChess[5][0].position,
    stack: [gs.playerChess[6][0].position, gs.playerChess[6][1].position]
  };
});
assert(stackCollision.mover === -1 && stackCollision.stack.every(position => position === -1),
  `stack collision failed setup=${JSON.stringify(stackCollisionSetup)} result=${JSON.stringify(stackCollision)}`);

console.log(JSON.stringify({
  topology,
  remoteSix,
  thirdSix,
  happyThirdSix,
  predecessorFlight,
  directFlight,
  blockedDirectFlight,
  blockedPredecessor,
  happyFlight,
  exactFinish,
  overshoot,
  singleCollisionSetup,
  singleCollision,
  stackCollisionSetup,
  stackCollision
}, null, 2));
console.log('six-player full rules regression passed');

await context.close();
await browser.close();
