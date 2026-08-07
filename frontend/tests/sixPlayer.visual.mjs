import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.SIX_PLAYER_PREVIEW_URL || 'http://127.0.0.1:4173';
const outputDir = process.env.SIX_PLAYER_SCREENSHOT_DIR || '/tmp/six-player-visual';
await fs.mkdir(outputDir, { recursive: true });

const sixPlayerConfig = {
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

async function openSixPlayerPage(viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on('pageerror', error => console.error('[pageerror]', error.message));
  await page.addInitScript(config => {
    sessionStorage.clear();
    sessionStorage.setItem('gameConfig', JSON.stringify(config));
  }, sixPlayerConfig);
  await page.goto(`${baseUrl}/game.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('body.six-player-mode #classic6-board-layer', { timeout: 15000 });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const loading = document.getElementById('loadingIndicator');
    if (loading) loading.style.display = 'none';
    document.documentElement.style.scrollBehavior = 'auto';
    document.querySelectorAll('*').forEach(el => {
      el.style.animationDuration = '0s';
      el.style.transitionDuration = '0s';
    });
  });
  return { context, page };
}

const desktop = await openSixPlayerPage({ width: 1440, height: 1100 });
const metrics = await desktop.page.evaluate(() => {
  const svg = document.getElementById('board-svg');
  const board = window.gameState?.getBoardDefinition?.();
  const desktopCards = [...document.querySelectorAll('.board-container > .players-info > .player-info')];
  const desktopCardRects = desktopCards.map(card => {
    const rect = card.getBoundingClientRect();
    const player = [...card.classList].find(name => /^player-\d+-info$/.test(name)) || '';
    return { player, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
  });
  const visibleDesktopCards = desktopCardRects.filter(rect =>
    rect.width > 0 && rect.height > 0 &&
    rect.left >= 0 && rect.top >= 0 &&
    rect.right <= window.innerWidth && rect.bottom <= window.innerHeight
  );

  const chess = [...document.querySelectorAll('#board-svg use[href="#chess"]')];
  const p4Chess = chess.filter(el => el.classList.contains('player-4')).map(el => ({
    x: Number(el.getAttribute('x')) + 5.6,
    y: Number(el.getAttribute('y')) + 5.6
  }));

  const scale = board?.visual?.baseScale ?? 1;
  const radius = board?.visual?.baseRadius ?? 0;
  const hole = 5.8 * scale;
  const expectedP4 = [
    { x: -hole, y: radius - hole },
    { x: hole, y: radius - hole },
    { x: -hole, y: radius + hole },
    { x: hole, y: radius + hole }
  ];
  const sorted = points => [...points].sort((a, b) => a.y - b.y || a.x - b.x);
  const actual = sorted(p4Chess);
  const expected = sorted(expectedP4);
  const baseErrors = actual.map((point, index) => Math.hypot(
    point.x - expected[index].x,
    point.y - expected[index].y
  ));

  return {
    boardId: svg?.dataset.boardId,
    ringCount: document.querySelectorAll('#classic6-board-layer .six-ring-cell').length,
    finishCount: document.querySelectorAll('#classic6-board-layer .six-finish-cell').length,
    launchCount: document.querySelectorAll('#classic6-board-layer .six-launch-cell').length,
    startCount: [...document.querySelectorAll('#classic6-board-layer use')].filter(el => /^player[1-6]-start$/.test(el.id)).length,
    chessCount: chess.length,
    desktopCardCount: desktopCards.length,
    visibleDesktopCardCount: visibleDesktopCards.length,
    desktopCardRects,
    maxBaseHoleError: Math.max(...baseErrors),
    svgRect: svg ? svg.getBoundingClientRect().toJSON() : null
  };
});

await desktop.page.screenshot({ path: path.join(outputDir, 'six-player-desktop.png'), fullPage: true });
await desktop.page.locator('.board-container').screenshot({ path: path.join(outputDir, 'six-player-board.png') });
await desktop.context.close();

const mobile = await openSixPlayerPage({ width: 390, height: 844 });
const mobileMetrics = await mobile.page.evaluate(() => ({
  topCards: document.querySelectorAll('.players-top > .player-info').length,
  bottomCards: document.querySelectorAll('.players-bottom > .player-info').length,
  boardWidth: document.getElementById('board-svg')?.getBoundingClientRect().width ?? 0,
  viewportWidth: window.innerWidth
}));
await mobile.page.screenshot({ path: path.join(outputDir, 'six-player-mobile.png'), fullPage: true });
await mobile.context.close();
await browser.close();

console.log(JSON.stringify({ metrics, mobileMetrics }, null, 2));

const failures = [];
if (metrics.boardId !== 'classic6') failures.push(`boardId=${metrics.boardId}`);
if (metrics.ringCount !== 78) failures.push(`ringCount=${metrics.ringCount}`);
if (metrics.finishCount !== 36) failures.push(`finishCount=${metrics.finishCount}`);
if (metrics.launchCount !== 6) failures.push(`launchCount=${metrics.launchCount}`);
if (metrics.startCount !== 6) failures.push(`startCount=${metrics.startCount}`);
if (metrics.chessCount !== 24) failures.push(`chessCount=${metrics.chessCount}`);
if (metrics.desktopCardCount !== 6) failures.push(`desktopCardCount=${metrics.desktopCardCount}`);
if (metrics.visibleDesktopCardCount !== 6) failures.push(`visibleDesktopCardCount=${metrics.visibleDesktopCardCount}`);
if (metrics.maxBaseHoleError > 0.9) failures.push(`base-hole alignment error=${metrics.maxBaseHoleError.toFixed(2)}`);
if (mobileMetrics.topCards !== 3 || mobileMetrics.bottomCards !== 3) failures.push(`mobile cards=${mobileMetrics.topCards}+${mobileMetrics.bottomCards}`);
if (mobileMetrics.boardWidth > mobileMetrics.viewportWidth + 1) failures.push(`mobile board overflow=${mobileMetrics.boardWidth}/${mobileMetrics.viewportWidth}`);

if (failures.length) {
  throw new Error(`six-player visual smoke failed: ${failures.join(', ')}`);
}

console.log('six-player visual smoke passed');
