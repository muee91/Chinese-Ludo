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
await page.evaluate(() => {
  document.getElementById('loadingIndicator')?.style.setProperty('display', 'none');
  window.audioManager?.mute?.();
});

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

async function clickAndMove(player) {
  await page.evaluate(async () => {
    await window.gameInstance.dice.debugRollDice(2);
  });
  await page.waitForFunction(() => window.gameInstance.gameState.getGamePhase() === 'selecting');

  const chess = page.locator(`#board-svg use[href="#chess"].player-${player}`).first();
  assert(await chess.isVisible(), `P${player} first chess is not visible`);
  assert(await chess.evaluate(element => element.classList.contains('chess-movable')),
    `P${player} first chess was not marked movable`);

  await chess.click();
  await page.waitForFunction(playerNumber => {
    const game = window.gameInstance;
    const gs = game.gameState;
    return gs.playerChess[playerNumber][0].position === 0 &&
      !gs.chessMoving &&
      gs.getGamePhase() === 'rolling';
  }, player, { timeout: 10000 });

  return page.evaluate(playerNumber => {
    const gs = window.gameInstance.gameState;
    return {
      player: playerNumber,
      position: gs.playerChess[playerNumber][0].position,
      phase: gs.getGamePhase(),
      currentPlayer: gs.getCurrentPlayer(),
      isRolling: gs.getIsRolling()
    };
  }, player);
}

await prepareTurn(5);
const p5 = await clickAndMove(5);
assert(p5.position === 0 && p5.phase === 'rolling', `P5 move failed: ${JSON.stringify(p5)}`);
assert(p5.currentPlayer === 6, `P5 did not hand off to P6: ${JSON.stringify(p5)}`);

await prepareTurn(6);
const p6 = await clickAndMove(6);
assert(p6.position === 0 && p6.phase === 'rolling', `P6 move failed: ${JSON.stringify(p6)}`);
assert(p6.currentPlayer === 1, `P6 did not wrap to P1: ${JSON.stringify(p6)}`);

console.log(JSON.stringify({ p5, p6 }, null, 2));
console.log('six-player interaction regression passed');

await context.close();
await browser.close();
