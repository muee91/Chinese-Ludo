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

async function openSixPlayerPage(viewport, config = sixPlayerConfig, multiplayerData = null) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on('pageerror', error => console.error('[pageerror]', error.message));
  await page.addInitScript(({ config, multiplayerData }) => {
    sessionStorage.clear();
    sessionStorage.setItem('gameConfig', JSON.stringify(config));
    if (multiplayerData) sessionStorage.setItem('multiplayerGameData', JSON.stringify(multiplayerData));
  }, { config, multiplayerData });
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
    const playerClass = [...card.classList].find(name => /^player-\d+-info$/.test(name)) || '';
    const player = Number(playerClass.match(/player-(\d+)-info/)?.[1] || 0);
    return {
      player,
      name: card.querySelector('.player-name')?.textContent?.trim() || '',
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height
    };
  });
  const visibleDesktopCards = desktopCardRects.filter(rect =>
    rect.width > 0 && rect.height > 0 &&
    rect.left >= 0 && rect.top >= 0 &&
    rect.right <= window.innerWidth && rect.bottom <= window.innerHeight
  );
  const cardByPlayer = Object.fromEntries(desktopCardRects.map(rect => [rect.player, rect]));

  const rectOf = element => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  };
  const p1Base = rectOf(document.getElementById('player1-start'));
  const p4Base = rectOf(document.getElementById('player4-start'));
  const topSeatBaseGap = p1Base && cardByPlayer[1] ? p1Base.top - cardByPlayer[1].bottom : -Infinity;
  const bottomSeatBaseGap = p4Base && cardByPlayer[4] ? cardByPlayer[4].top - p4Base.bottom : -Infinity;

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

  const progressColor = player => {
    const avatar = document.querySelector(`.progress-item[data-player="${player}"] .progress-avatar`);
    return avatar ? getComputedStyle(avatar).backgroundColor : '';
  };

  const progressRows = [...document.querySelectorAll('.progress-content .progress-item')].map(item => ({
    player: Number(item.dataset.player),
    name: item.querySelector('.progress-player-name')?.textContent?.trim() || '',
    percentage: item.querySelector('.progress-percentage')?.textContent?.trim() || ''
  }));

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
    desktopDefeatCounterCount: [...document.querySelectorAll('.board-container > .players-info .defeat-count')]
      .filter(element => element.offsetParent !== null).length,
    activeDesktopPlayers: desktopCards.filter(card => card.classList.contains('six-seat-active')).map(card => Number([...card.classList].find(name => /^player-\d+-info$/.test(name))?.match(/\d+/)?.[0] || 0)),
    topSeatBaseGap,
    bottomSeatBaseGap,
    progressAvatarCount: document.querySelectorAll('.progress-content .progress-avatar').length,
    progressAvatarColors: { 5: progressColor(5), 6: progressColor(6) },
    progressRows,
    maxBaseHoleError: Math.max(...baseErrors),
    svgRect: svg ? svg.getBoundingClientRect().toJSON() : null
  };
});

await desktop.page.screenshot({ path: path.join(outputDir, 'six-player-desktop.png'), fullPage: true });
await desktop.page.locator('.board-container').screenshot({ path: path.join(outputDir, 'six-player-board.png') });

const activeSeatAfterTurnChange = await desktop.page.evaluate(() => {
  const gs = window.gameInstance.gameState;
  gs.setCurrentPlayer(4);
  gs.setGamePhase('rolling');
  window.gameInstance.uiUpdater.updateUI();
  const playerNumber = element => Number([...element.classList].find(name => /^player-\d+-info$/.test(name))?.match(/\d+/)?.[0] || 0);
  return {
    desktop: [...document.querySelectorAll('.board-container > .players-info .six-seat-active')].map(playerNumber),
    mobile: [...document.querySelectorAll('.players-top .six-seat-active, .players-bottom .six-seat-active')].map(playerNumber)
  };
});
const progressUpdate = await desktop.page.evaluate(() => {
  window.gameInstance.progressDisplay.updatePlayerProgress(5, 42);
  const item = document.querySelector('.progress-item[data-player="5"]');
  return {
    width: item?.querySelector('.progress-fill')?.style.width || '',
    percentage: item?.querySelector('.progress-percentage')?.textContent?.trim() || ''
  };
});
await desktop.context.close();

async function collectResponsiveMetrics(viewport) {
  const fixture = await openSixPlayerPage(viewport);
  const result = await fixture.page.evaluate(() => {
    const visibleCards = [...document.querySelectorAll('.player-info')]
      .map(element => element.getBoundingClientRect())
      .filter(rect => rect.width > 0 && rect.height > 0);
    const board = document.getElementById('board-svg')?.getBoundingClientRect();
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      boardWidth: board?.width || 0,
      boardHeight: board?.height || 0,
      visibleCardCount: visibleCards.length,
      hasOverflow: visibleCards.some(rect => rect.left < -1 || rect.top < -1 || rect.right > window.innerWidth + 1 || rect.bottom > window.innerHeight + 1)
    };
  });
  await fixture.context.close();
  return result;
}

const responsiveMetrics = {
  desktop1280: await collectResponsiveMetrics({ width: 1280, height: 1000 }),
  tablet1000: await collectResponsiveMetrics({ width: 1000, height: 800 }),
  mobile390: await collectResponsiveMetrics({ width: 390, height: 844 })
};

// 截图对应的人机六人模式：Bot 名称由 playerNameManager 生成，棋盘
// 席位创建发生在 handleUrlParameters 之后，必须验证名称不会退回为“玩家5/6”。
const aiBattleConfig = {
  mode: 'ai_battle',
  boardId: 'classic6',
  humanPlayer: 1,
  humanUsername: '玩家',
  humanEmoji: 'smile',
  pieceCount: 4,
  bots: [2, 3, 4, 5, 6],
  botDifficulties: { 2: 'easy', 3: 'easy', 4: 'easy', 5: 'easy', 6: 'easy' },
  skillMode: false,
  happyMode: false
};
const aiBattle = await openSixPlayerPage({ width: 1440, height: 1100 }, aiBattleConfig);
const aiBattleMetrics = await aiBattle.page.evaluate(() => ({
  title: document.title,
  names: [...document.querySelectorAll('.board-container > .players-info .player-name')].map(element => element.textContent?.trim() || ''),
  progressNames: [...document.querySelectorAll('.progress-item .progress-player-name')].map(element => element.textContent?.trim() || ''),
  activeSeat: [...document.querySelectorAll('.board-container > .players-info .six-seat-active')].map(element => element.querySelector('.player-name')?.textContent?.trim() || '')
}));
await aiBattle.page.screenshot({ path: path.join(outputDir, 'six-player-ai.png'), fullPage: true });
await aiBattle.context.close();

// 只有2名参与者，但包含 P5 时也必须自动使用 classic6；不能只按“人数>4”判断。
const sparseP5Config = {
  mode: 'local_multiplayer',
  playerCount: 2,
  pieceCount: 4,
  skillMode: false,
  happyMode: false,
  players: [
    { id: 1, name: '稀疏玩家1', isAI: false },
    { id: 5, name: '稀疏玩家5', isAI: false }
  ]
};
const sparseP5 = await openSixPlayerPage({ width: 1000, height: 800 }, sparseP5Config);
const sparseP5Metrics = await sparseP5.page.evaluate(() => ({
  boardId: window.gameInstance.gameState.getBoardDefinition().id,
  activePlayers: window.activePlayerManager.getActivePlayers(),
  hasP5Chess: document.querySelectorAll('#board-svg use[href="#chess"].player-5').length === 4,
  sixLayerExists: !!document.getElementById('classic6-board-layer')
}));
await sparseP5.context.close();

// 昵称安全：HTML-looking 内容必须被当作普通文本，而不是插入 DOM。
const maliciousName = '<img id="nickname-injection" src="x">玩家5';
const maliciousConfig = JSON.parse(JSON.stringify(sixPlayerConfig));
maliciousConfig.players.find(player => player.id === 5).name = maliciousName;
const malicious = await openSixPlayerPage({ width: 1000, height: 800 }, maliciousConfig);
const maliciousMetrics = await malicious.page.evaluate(() => ({
  player5Name: document.querySelector('.board-container > .players-info .player-5-info .player-name')?.textContent || '',
  injectedElementExists: !!document.getElementById('nickname-injection')
}));
await malicious.context.close();

// 联机昵称解析：真实玩家 id 通常是字符串，阵营编号来自 color/playerNumber。
// 使用真正的 online_multiplayer 模式，避免本地模式初始化按设计清除 multiplayerGameData。
const fallbackConfig = JSON.parse(JSON.stringify(sixPlayerConfig));
fallbackConfig.mode = 'online_multiplayer';
fallbackConfig.players.forEach(player => {
  if (player.id === 5 || player.id === 6) delete player.name;
});
const onlinePayload = {
  mode: 'online_multiplayer',
  boardId: 'classic6',
  playerCount: 2,
  pieceCount: 4,
  skillMode: false,
  happyMode: false,
  gameSessionId: 'game_visual_names',
  isSpectator: true,
  currentPlayer: { id: 'player_remote_5', color: 5 },
  players: [
    { id: 'player_remote_5', color: 5, nickname: '联机玩家5', isAI: false },
    { id: 'player_remote_6', playerNumber: 6, color: 6, nickname: '联机玩家6', isAI: false }
  ]
};
const online = await openSixPlayerPage({ width: 1000, height: 800 }, fallbackConfig, onlinePayload);
const onlineNameMetrics = await online.page.evaluate(() => ({
  activePlayers: window.activePlayerManager.getActivePlayers(),
  desktop5: document.querySelector('.board-container > .players-info .player-5-info .player-name')?.textContent?.trim() || '',
  desktop6: document.querySelector('.board-container > .players-info .player-6-info .player-name')?.textContent?.trim() || '',
  mobile5: document.querySelector('.players-bottom .player-5-info .player-name')?.textContent?.trim() || '',
  mobile6: document.querySelector('.players-top .player-6-info .player-name')?.textContent?.trim() || ''
}));
await online.context.close();

const mobile = await openSixPlayerPage({ width: 390, height: 844 });
const mobileMetrics = await mobile.page.evaluate(() => ({
  topCards: document.querySelectorAll('.players-top > .player-info').length,
  bottomCards: document.querySelectorAll('.players-bottom > .player-info').length,
  player5Name: document.querySelector('.players-bottom .player-5-info .player-name')?.textContent?.trim() || '',
  player6Name: document.querySelector('.players-top .player-6-info .player-name')?.textContent?.trim() || '',
  activeCards: [...document.querySelectorAll('.players-top .six-seat-active, .players-bottom .six-seat-active')].map(el => Number([...el.classList].find(name => /^player-\d+-info$/.test(name))?.match(/\d+/)?.[0] || 0)),
  boardWidth: document.getElementById('board-svg')?.getBoundingClientRect().width ?? 0,
  viewportWidth: window.innerWidth
}));
await mobile.page.screenshot({ path: path.join(outputDir, 'six-player-mobile.png'), fullPage: true });
await mobile.context.close();
await browser.close();

console.log(JSON.stringify({ metrics, activeSeatAfterTurnChange, progressUpdate, responsiveMetrics, aiBattleMetrics, sparseP5Metrics, maliciousMetrics, onlineNameMetrics, mobileMetrics }, null, 2));

const failures = [];
const playerNames = Object.fromEntries(metrics.desktopCardRects.map(item => [item.player, item.name]));
if (metrics.boardId !== 'classic6') failures.push(`boardId=${metrics.boardId}`);
if (metrics.ringCount !== 78) failures.push(`ringCount=${metrics.ringCount}`);
if (metrics.finishCount !== 36) failures.push(`finishCount=${metrics.finishCount}`);
if (metrics.launchCount !== 6) failures.push(`launchCount=${metrics.launchCount}`);
if (metrics.startCount !== 6) failures.push(`startCount=${metrics.startCount}`);
if (metrics.chessCount !== 24) failures.push(`chessCount=${metrics.chessCount}`);
if (metrics.desktopCardCount !== 6) failures.push(`desktopCardCount=${metrics.desktopCardCount}`);
if (metrics.visibleDesktopCardCount !== 6) failures.push(`visibleDesktopCardCount=${metrics.visibleDesktopCardCount}`);
if (metrics.desktopDefeatCounterCount !== 0) failures.push(`desktopDefeatCounterCount=${metrics.desktopDefeatCounterCount}`);
if (JSON.stringify(metrics.activeDesktopPlayers) !== JSON.stringify([1])) failures.push(`active desktop seats=${JSON.stringify(metrics.activeDesktopPlayers)}`);
if (metrics.topSeatBaseGap < 8) failures.push(`P1 base gap=${metrics.topSeatBaseGap.toFixed(2)}`);
if (metrics.bottomSeatBaseGap < 8) failures.push(`P4 base gap=${metrics.bottomSeatBaseGap.toFixed(2)}`);
if (playerNames[5] !== '玩家5' || playerNames[6] !== '玩家6') failures.push(`desktop P5/P6 names=${playerNames[5]}/${playerNames[6]}`);
if (metrics.progressAvatarCount !== 6) failures.push(`progressAvatarCount=${metrics.progressAvatarCount}`);
if (metrics.progressAvatarColors[5] !== 'rgb(199, 185, 223)') failures.push(`P5 progress color=${metrics.progressAvatarColors[5]}`);
if (metrics.progressAvatarColors[6] !== 'rgb(217, 207, 152)') failures.push(`P6 progress color=${metrics.progressAvatarColors[6]}`);
const progressNames = Object.fromEntries(metrics.progressRows.map(row => [row.player, row.name]));
const progressPercentages = Object.fromEntries(metrics.progressRows.map(row => [row.player, row.percentage]));
if (metrics.progressRows.length !== 6) failures.push(`progressRows=${metrics.progressRows.length}`);
if (progressNames[5] !== '玩家5' || progressNames[6] !== '玩家6') failures.push(`progress P5/P6 names=${progressNames[5]}/${progressNames[6]}`);
if (Object.values(progressPercentages).some(value => value !== '0%')) failures.push(`progress percentages=${JSON.stringify(progressPercentages)}`);
if (metrics.maxBaseHoleError > 0.9) failures.push(`base-hole alignment error=${metrics.maxBaseHoleError.toFixed(2)}`);
if (JSON.stringify(activeSeatAfterTurnChange.desktop) !== JSON.stringify([4])) failures.push(`active desktop after turn=${JSON.stringify(activeSeatAfterTurnChange.desktop)}`);
if (progressUpdate.width !== '42%' || progressUpdate.percentage !== '42%') failures.push(`progress update=${JSON.stringify(progressUpdate)}`);
if (responsiveMetrics.desktop1280.hasOverflow || responsiveMetrics.tablet1000.hasOverflow || responsiveMetrics.mobile390.hasOverflow) {
  failures.push(`responsive overflow=${JSON.stringify(responsiveMetrics)}`);
}
if (responsiveMetrics.desktop1280.visibleCardCount !== 6 || responsiveMetrics.tablet1000.visibleCardCount !== 6 || responsiveMetrics.mobile390.visibleCardCount !== 6) {
  failures.push(`responsive card counts=${JSON.stringify(responsiveMetrics)}`);
}
if (aiBattleMetrics.title !== '人机对战-6人4棋子-标准模式') failures.push(`AI title=${aiBattleMetrics.title}`);
if (JSON.stringify(aiBattleMetrics.names) !== JSON.stringify(['玩家', 'Bot-1', 'Bot-2', 'Bot-3', 'Bot-4', 'Bot-5'])) {
  failures.push(`AI names=${JSON.stringify(aiBattleMetrics.names)}`);
}
if (JSON.stringify(aiBattleMetrics.progressNames) !== JSON.stringify(['玩家', 'Bot-1', 'Bot-2', 'Bot-3', 'Bot-4', 'Bot-5'])) {
  failures.push(`AI progress names=${JSON.stringify(aiBattleMetrics.progressNames)}`);
}
if (JSON.stringify(aiBattleMetrics.activeSeat) !== JSON.stringify(['玩家'])) failures.push(`AI active seat=${JSON.stringify(aiBattleMetrics.activeSeat)}`);
if (sparseP5Metrics.boardId !== 'classic6' || !sparseP5Metrics.sixLayerExists || !sparseP5Metrics.hasP5Chess) {
  failures.push(`sparse P1+P5 board=${JSON.stringify(sparseP5Metrics)}`);
}
if (JSON.stringify(sparseP5Metrics.activePlayers) !== JSON.stringify([1,5])) failures.push(`sparse active players=${JSON.stringify(sparseP5Metrics.activePlayers)}`);
if (maliciousMetrics.player5Name !== maliciousName) failures.push(`unsafe nickname text=${maliciousMetrics.player5Name}`);
if (maliciousMetrics.injectedElementExists) failures.push('nickname HTML was injected into DOM');
if (JSON.stringify(onlineNameMetrics.activePlayers) !== JSON.stringify([5,6])) failures.push(`online active players=${JSON.stringify(onlineNameMetrics.activePlayers)}`);
if (onlineNameMetrics.desktop5 !== '联机玩家5' || onlineNameMetrics.desktop6 !== '联机玩家6') {
  failures.push(`online desktop names=${onlineNameMetrics.desktop5}/${onlineNameMetrics.desktop6}`);
}
if (onlineNameMetrics.mobile5 !== '联机玩家5' || onlineNameMetrics.mobile6 !== '联机玩家6') {
  failures.push(`online mobile names=${onlineNameMetrics.mobile5}/${onlineNameMetrics.mobile6}`);
}
if (mobileMetrics.topCards !== 3 || mobileMetrics.bottomCards !== 3) failures.push(`mobile cards=${mobileMetrics.topCards}+${mobileMetrics.bottomCards}`);
if (mobileMetrics.player5Name !== '玩家5' || mobileMetrics.player6Name !== '玩家6') failures.push(`mobile P5/P6 names=${mobileMetrics.player5Name}/${mobileMetrics.player6Name}`);
if (JSON.stringify(mobileMetrics.activeCards) !== JSON.stringify([1])) failures.push(`mobile active seats=${JSON.stringify(mobileMetrics.activeCards)}`);
if (mobileMetrics.boardWidth > mobileMetrics.viewportWidth + 1) failures.push(`mobile board overflow=${mobileMetrics.boardWidth}/${mobileMetrics.viewportWidth}`);

if (failures.length) {
  throw new Error(`six-player visual smoke failed: ${failures.join(', ')}`);
}

console.log('six-player visual smoke passed');
