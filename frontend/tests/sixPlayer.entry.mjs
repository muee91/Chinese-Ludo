import { chromium } from 'playwright';

const baseUrl = process.env.SIX_PLAYER_PREVIEW_URL || 'http://127.0.0.1:4173';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.on('pageerror', error => console.error('[pageerror]', error.message));

await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => sessionStorage.clear());
await page.waitForSelector('#menuSixPlayerBtn', { timeout: 15000 });

const menu = await page.evaluate(() => ({
  buttonText: document.getElementById('menuSixPlayerBtn')?.textContent?.trim() || '',
  buttonVisible: Boolean(document.getElementById('menuSixPlayerBtn')?.getBoundingClientRect().width)
}));
assert(menu.buttonText === '六人模式', `menu text=${menu.buttonText}`);
assert(menu.buttonVisible, 'six-player menu entry is not visible');

await page.getByRole('button', { name: '六人模式' }).click();
await page.waitForSelector('#aiBattleConfig[style*="flex"], #aiBattleConfig:not([style*="none"])', { timeout: 15000 });

const config = await page.evaluate(() => ({
  title: document.getElementById('configTitle')?.textContent?.trim() || '',
  colorCount: document.querySelectorAll('.ai-battle-config .color-option').length,
  botPlayers: [...document.querySelectorAll('.ai-battle-config .bot-player')]
    .map(element => Number(element.dataset.player))
    .sort((a, b) => a - b),
  startText: document.getElementById('startGame')?.textContent?.trim() || ''
}));
assert(config.title === '六人模式设置', `config title=${config.title}`);
assert(config.colorCount === 6, `AI color count=${config.colorCount}`);
assert(JSON.stringify(config.botPlayers) === JSON.stringify([2, 3, 4, 5, 6]), `AI players=${JSON.stringify(config.botPlayers)}`);
assert(config.startText.includes('1人5机'), `start button=${config.startText}`);

await page.locator('#startGame').click();
await page.waitForFunction(
  () => document.body.classList.contains('six-player-mode') && Boolean(document.getElementById('classic6-board-layer')),
  null,
  { timeout: 15000 }
);
await page.waitForFunction(() => window.gameInstance?.gameState && window.activePlayerManager);

const game = await page.evaluate(() => ({
  title: document.title,
  boardId: window.gameInstance.gameState.getBoardDefinition().id,
  activePlayers: window.activePlayerManager.getActivePlayers(),
  sixLayer: Boolean(document.getElementById('classic6-board-layer')),
  sessionConfig: JSON.parse(sessionStorage.getItem('gameConfig') || 'null')
}));
assert(game.title === '人机对战-6人4棋子-标准模式', `game title=${game.title}`);
assert(game.boardId === 'classic6', `boardId=${game.boardId}`);
assert(JSON.stringify(game.activePlayers) === JSON.stringify([1, 2, 3, 4, 5, 6]), `active players=${JSON.stringify(game.activePlayers)}`);
assert(game.sixLayer, 'classic6 renderer layer is missing');
assert(game.sessionConfig?.bots?.length === 5, `session bots=${JSON.stringify(game.sessionConfig?.bots)}`);

console.log(JSON.stringify({ menu, config, game }, null, 2));
console.log('six-player entry smoke passed');

await context.close();
await browser.close();
