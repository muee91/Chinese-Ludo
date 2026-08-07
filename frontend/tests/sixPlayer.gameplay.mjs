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
    name: `玩家${index + 1}`,
    isAI: false
  }))
};

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
await page.evaluate(() => {
  document.getElementById('loadingIndicator')?.style.setProperty('display', 'none');
  window.audioManager?.mute?.();
});

const initial = await page.evaluate(() => {
  const game = window.gameInstance;
  const gs = game.gameState;
  const apm = window.activePlayerManager;
  apm.setActivePlayers([1, 2, 3, 4, 5, 6]);
  apm.setCurrentActivePlayer(1);
  const sequence = [apm.getCurrentActivePlayer()];
  for (let i = 0; i < 6; i++) sequence.push(apm.getNextActivePlayer());

  gs.setCurrentPlayer(5);
  apm.setCurrentActivePlayer(5);
  gs.setGamePhase('selecting');
  return {
    activePlayers: apm.getActivePlayers(),
    sequence,
    p5CanLaunchOn2: game.uiUpdater.canChessMove(5, 0, 2),
    p5CanLaunchOn3: game.uiUpdater.canChessMove(5, 0, 3),
    p6CanLaunchOn2: game.uiUpdater.canChessMove(6, 0, 2),
    p6CanLaunchOn3: game.uiUpdater.canChessMove(6, 0, 3)
  };
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(JSON.stringify(initial.activePlayers) === JSON.stringify([1,2,3,4,5,6]), `active players=${JSON.stringify(initial.activePlayers)}`);
assert(JSON.stringify(initial.sequence) === JSON.stringify([1,2,3,4,5,6,1]), `turn sequence=${JSON.stringify(initial.sequence)}`);
assert(initial.p5CanLaunchOn2 && !initial.p5CanLaunchOn3, `P5 launch rule 2/3=${initial.p5CanLaunchOn2}/${initial.p5CanLaunchOn3}`);
assert(initial.p6CanLaunchOn2 && !initial.p6CanLaunchOn3, `P6 launch rule 2/3=${initial.p6CanLaunchOn2}/${initial.p6CanLaunchOn3}`);

async function prepareTurn(player) {
  await page.evaluate(playerNumber => {
    const game = window.gameInstance;
    const gs = game.gameState;
    window.activePlayerManager.setCurrentActivePlayer(playerNumber);
    gs.setCurrentPlayer(playerNumber);
    gs.setGamePhase('rolling');
    gs.setIsRolling(false);
    gs.setDiceValue(0);
    gs.canReroll = false;
    gs.justRolledSix = false;
    gs.consecutiveSixes = 0;
    game.chessPiece.clearClickDebounce();
  }, player);
}

async function debugRoll(value) {
  await page.evaluate(async diceValue => {
    await window.gameInstance.dice.debugRollDice(diceValue);
  }, value);
}

async function clickChess(player, chessIndex) {
  await page.evaluate(({ player, chessIndex }) => {
    window.gameInstance.chessPiece.onChessClick(player, chessIndex, null);
  }, { player, chessIndex });
}

// P5：偶数起飞，并由原 nextPlayer 链路轮转到 P6。
await prepareTurn(5);
await debugRoll(2);
await page.waitForFunction(() => window.gameInstance.gameState.getGamePhase() === 'selecting');
await clickChess(5, 0);
await page.waitForFunction(() => {
  const gs = window.gameInstance.gameState;
  return gs.playerChess[5][0].position === 0 && gs.getCurrentPlayer() === 6 && !gs.chessMoving;
}, null, { timeout: 8000 });

// P6：偶数起飞，并从最后一个玩家正确轮回到 P1。
await prepareTurn(6);
await debugRoll(2);
await page.waitForFunction(() => window.gameInstance.gameState.getGamePhase() === 'selecting');
await clickChess(6, 0);
await page.waitForFunction(() => {
  const gs = window.gameInstance.gameState;
  return gs.playerChess[6][0].position === 0 && gs.getCurrentPlayer() === 1 && !gs.chessMoving;
}, null, { timeout: 8000 });

// P5 已起飞棋子正常按骰子前进 3 格。
await prepareTurn(5);
await debugRoll(3);
await page.waitForFunction(() => window.gameInstance.gameState.getGamePhase() === 'selecting');
await clickChess(5, 0);
await page.waitForFunction(() => {
  const gs = window.gameInstance.gameState;
  return gs.playerChess[5][0].position === 3 && !gs.chessMoving;
}, null, { timeout: 10000 });

// P5 飞棋：把 P5 放到飞行格 26；对家 P2 的第 3 个终点航道格 79 放一枚单棋。
// 调用的仍是原 ChessPiece.handleSpecialPositions / performFlyingChess 链路。
const flight = await page.evaluate(async () => {
  const game = window.gameInstance;
  const gs = game.gameState;
  const mover = gs.playerChess[5][0];
  const victim = gs.playerChess[2][0];

  mover.position = 26;
  mover.finished = false;
  mover.lastLandPos = 1;
  victim.position = 79;
  victim.finished = false;
  victim.lastLandPos = 1;

  game.animation.updateChessPosition(5, 0, null, false);
  game.animation.updateChessPosition(2, 0, null, false);
  game.chessPiece.clearClickDebounce();
  await game.chessPiece.handleSpecialPositions(5, 0, 26);

  return {
    moverPosition: mover.position,
    victimPosition: victim.position,
    opponentOf5: game.utils.getOpponentPlayer(5),
    flightPoint: gs.getBoardDefinition().flightPoint,
    flightTarget: gs.getBoardDefinition().flightTarget,
    flightPostJump: gs.getBoardDefinition().flightPostJump,
    crossPosition: gs.getBoardDefinition().getFlightCrossPosition()
  };
});

assert(flight.opponentOf5 === 2, `P5 opponent=${flight.opponentOf5}`);
assert(flight.flightPoint === 26 && flight.flightTarget === 50 && flight.flightPostJump === 56, `flight topology=${JSON.stringify(flight)}`);
assert(flight.crossPosition === 79, `flight cross=${flight.crossPosition}`);
assert(flight.moverPosition === 56, `P5 flight final=${flight.moverPosition}`);
assert(flight.victimPosition === -1, `P2 crossing victim final=${flight.victimPosition}`);

const finalState = await page.evaluate(() => ({
  p5: window.gameInstance.gameState.playerChess[5][0].position,
  p6: window.gameInstance.gameState.playerChess[6][0].position,
  p2Victim: window.gameInstance.gameState.playerChess[2][0].position,
  currentPlayer: window.gameInstance.gameState.getCurrentPlayer()
}));

console.log(JSON.stringify({ initial, flight, finalState }, null, 2));
console.log('six-player gameplay smoke passed');

await context.close();
await browser.close();
