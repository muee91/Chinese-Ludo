import { chromium } from 'playwright';

const baseUrl = process.env.SIX_PLAYER_PREVIEW_URL || 'http://127.0.0.1:4173';
const config = {
  mode: 'local_multiplayer',
  boardId: 'classic4',
  playerCount: 4,
  pieceCount: 4,
  skillMode: false,
  happyMode: false,
  players: Array.from({ length: 4 }, (_, index) => ({
    id: index + 1,
    name: `玩家${index + 1}`,
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
await page.waitForFunction(() => window.gameInstance?.chessPiece && window.activePlayerManager, null, { timeout: 15000 });
await page.evaluate(() => {
  document.getElementById('loadingIndicator')?.style.setProperty('display', 'none');
  window.audioManager?.mute?.();
});

const initial = await page.evaluate(() => {
  const game = window.gameInstance;
  const gs = game.gameState;
  const apm = window.activePlayerManager;
  apm.setActivePlayers([1,2,3,4]);
  apm.setCurrentActivePlayer(1);
  const sequence = [apm.getCurrentActivePlayer()];
  for (let i = 0; i < 4; i++) sequence.push(apm.getNextActivePlayer());
  gs.setCurrentPlayer(1);
  gs.setGamePhase('selecting');
  return {
    boardId: gs.getBoardDefinition().id,
    bodySixMode: document.body.classList.contains('six-player-mode'),
    sixLayerExists: !!document.getElementById('classic6-board-layer'),
    sequence,
    p1CanLaunchOn2: game.uiUpdater.canChessMove(1, 0, 2),
    p1CanLaunchOn3: game.uiUpdater.canChessMove(1, 0, 3),
    opponent1: game.utils.getOpponentPlayer(1),
    flightPoint: gs.getBoardDefinition().flightPoint,
    flightTarget: gs.getBoardDefinition().flightTarget,
    flightPostJump: gs.getBoardDefinition().flightPostJump,
    crossPosition: gs.getBoardDefinition().getFlightCrossPosition()
  };
});

assert(initial.boardId === 'classic4', `boardId=${initial.boardId}`);
assert(initial.bodySixMode === false, 'classic4 page unexpectedly has six-player-mode class');
assert(initial.sixLayerExists === false, 'classic4 page unexpectedly rebuilt with classic6 layer');
assert(JSON.stringify(initial.sequence) === JSON.stringify([1,2,3,4,1]), `turn sequence=${JSON.stringify(initial.sequence)}`);
assert(initial.p1CanLaunchOn2 && !initial.p1CanLaunchOn3, `launch rule=${initial.p1CanLaunchOn2}/${initial.p1CanLaunchOn3}`);
assert(initial.opponent1 === 3, `P1 opponent=${initial.opponent1}`);
assert(initial.flightPoint === 18 && initial.flightTarget === 30 && initial.flightPostJump === 34, `flight topology=${JSON.stringify(initial)}`);
assert(initial.crossPosition === 53, `crossPosition=${initial.crossPosition}`);

// 使用原 ChessPiece 特殊格链路验证经典四人飞棋仍为 18→30→34，且穿过 P3 的 53 撞机。
const flight = await page.evaluate(async () => {
  const game = window.gameInstance;
  const gs = game.gameState;
  const mover = gs.playerChess[1][0];
  const victim = gs.playerChess[3][0];

  mover.position = 18;
  mover.finished = false;
  mover.lastLandPos = 1;
  victim.position = 53;
  victim.finished = false;
  victim.lastLandPos = 1;

  game.animation.updateChessPosition(1, 0, null, false);
  game.animation.updateChessPosition(3, 0, null, false);
  game.chessPiece.clearClickDebounce();
  await game.chessPiece.handleSpecialPositions(1, 0, 18);

  return {
    moverPosition: mover.position,
    victimPosition: victim.position,
    opponent: game.utils.getOpponentPlayer(1)
  };
});

assert(flight.moverPosition === 34, `classic4 P1 flight final=${flight.moverPosition}`);
assert(flight.victimPosition === -1, `classic4 P3 crossing victim final=${flight.victimPosition}`);
assert(flight.opponent === 3, `classic4 opponent=${flight.opponent}`);

console.log(JSON.stringify({ initial, flight }, null, 2));
console.log('classic4 browser regression passed');

await context.close();
await browser.close();
