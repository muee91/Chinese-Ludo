import fs from 'node:fs';

const patch = (file, fn) => {
  const original = fs.readFileSync(file, 'utf8');
  const next = fn(original);
  fs.writeFileSync(file, next);
};
const replaceRequired = (text, from, to, label) => {
  if (!text.includes(from)) throw new Error(`Missing required pattern: ${label}`);
  return text.replace(from, to);
};

patch('backend/server.cjs', text => {
  // 房间容量链路全部使用房间设置中的 maxPlayers，默认6。
  text = text.replaceAll('if (totalPlayerCount >= 4) throw new Error(\'房间已满\');', "if (totalPlayerCount >= (room.settings?.maxPlayers ?? 6)) throw new Error('房间已满');");
  text = text.replaceAll("if (totalPlayerCount >= 4) {\n    ws.send(JSON.stringify({ type: 'error', message: '房间已满' }));", "if (totalPlayerCount >= (room.settings?.maxPlayers ?? 6)) {\n    ws.send(JSON.stringify({ type: 'error', message: '房间已满' }));");
  text = text.replaceAll("if (totalPlayerCount >= 4 && room.gameState !== 'playing') continue;", "if (totalPlayerCount >= (room.settings?.maxPlayers ?? 6) && room.gameState !== 'playing') continue;");

  text = replaceRequired(text,
    "this.settings = { pieceCount: 4, aiPlayers: [], skillMode: false, happyMode: false };",
    "this.settings = { pieceCount: 4, aiPlayers: [], skillMode: false, happyMode: false, maxPlayers: 6, boardId: 'classic4' };",
    'Room.settings');

  // 修复早期迁移留下的未定义 maxPlayers，并让大厅能看到当前棋盘类型。
  text = text.replace(/maxPlayers:\s*6,\s*\n\s*boardId:\s*Number\(maxPlayers\) > 4 \? 'classic6' : 'classic4',/,
    "maxPlayers: room.settings?.maxPlayers ?? 6,\n        boardId: room.settings?.boardId || (totalPlayerCount > 4 ? 'classic6' : 'classic4'),");

  // 开始游戏时按实际真实+AI人数确定棋盘，2-4人沿用 classic4，5-6人使用 classic6。
  text = replaceRequired(text,
    "  const allPlayers = [...realPlayers, ...aiPlayers];\n\n  // 创建游戏会话",
    "  const allPlayers = [...realPlayers, ...aiPlayers];\n  room.settings.maxPlayers = 6;\n  room.settings.boardId = allPlayers.length > 4 ? 'classic6' : 'classic4';\n\n  // 创建游戏会话",
    'handleStartGame boardId');

  text = replaceRequired(text,
    "    type: 'gameStarted',\n    gameSessionId,\n    pieceCount: room.settings.pieceCount,",
    "    type: 'gameStarted',\n    gameSessionId,\n    boardId: room.settings.boardId,\n    playerCount: allPlayers.length,\n    pieceCount: room.settings.pieceCount,",
    'gameStarted payload');

  // 会话数据也持久化 boardId，供重连/观战恢复。
  text = replaceRequired(text,
    "      gameSessionId: gameSessionId, // 添加gameSessionId以支持重连\n      gameStartTime: Date.now(),",
    "      gameSessionId: gameSessionId, // 添加gameSessionId以支持重连\n      boardId: players.length > 4 ? 'classic6' : 'classic4',\n      playerCount: players.length,\n      gameStartTime: Date.now(),",
    'GameSession gameData boardId');

  // 注释同步更新，避免继续误导为1-4。
  text = text.replaceAll('玩家编号等于颜色编号（1-4）', '玩家编号等于颜色编号（1-6）');
  text = text.replaceAll('统一用color（1-4）', '统一用color（1-6）');
  return text;
});

patch('frontend/js/multiplayerManager.js', text => {
  text = text.replace("const maxPlayers = (room.maxPlayers != null ? room.maxPlayers : 4);", "const maxPlayers = (room.maxPlayers != null ? room.maxPlayers : 6);");
  text = text.replace("preview.classList.remove('player-1-color', 'player-2-color', 'player-3-color', 'player-4-color');",
    "preview.classList.remove('player-1-color', 'player-2-color', 'player-3-color', 'player-4-color', 'player-5-color', 'player-6-color');");

  const onlineConfigNeedle = `        const gameConfig = {
            mode: 'online_multiplayer',
            playerCount: allPlayers.length,
            pieceCount: gameData.pieceCount || 4,
            skillMode: skillModeEnabled,
            happyMode: happyModeEnabled
        };`;
  const onlineConfigReplacement = `        const boardId = gameData.boardId
            || this.currentRoom?.settings?.boardId
            || (allPlayers.length > 4 ? 'classic6' : 'classic4');
        const gameConfig = {
            mode: 'online_multiplayer',
            boardId,
            playerCount: allPlayers.length,
            pieceCount: gameData.pieceCount || 4,
            skillMode: skillModeEnabled,
            happyMode: happyModeEnabled
        };`;
  text = replaceRequired(text, onlineConfigNeedle, onlineConfigReplacement, 'online gameConfig');

  const reconnectNeedle = `        const gameConfig = {
            mode: 'online_multiplayer',
            playerCount: allPlayers.length,
            pieceCount: gameData.pieceCount || 4,
            skillMode: skillModeEnabled // 添加道具模式配置
        };`;
  const reconnectReplacement = `        const happyModeEnabled = gameData.happyMode !== undefined
            ? gameData.happyMode
            : (this.currentRoom?.settings?.happyMode || false);
        const boardId = gameData.boardId
            || this.currentRoom?.settings?.boardId
            || (allPlayers.length > 4 ? 'classic6' : 'classic4');
        const gameConfig = {
            mode: 'online_multiplayer',
            boardId,
            playerCount: allPlayers.length,
            pieceCount: gameData.pieceCount || 4,
            skillMode: skillModeEnabled,
            happyMode: happyModeEnabled
        };`;
  text = replaceRequired(text, reconnectNeedle, reconnectReplacement, 'reconnect gameConfig');

  text = text.replace("            skillMode: skillModeEnabled, // 明确添加道具模式配置\n            wsClient:",
    "            boardId,\n            skillMode: skillModeEnabled,\n            happyMode: happyModeEnabled,\n            wsClient:");

  return text;
});

patch('frontend/js/activePlayerManager.js', text => {
  if (!text.includes("getCurrentBoardDefinition")) {
    text = text.replace("import { SUPPORTED_PLAYERS } from './boards/boardConfig.js';", "import { SUPPORTED_PLAYERS, getCurrentBoardDefinition } from './boards/boardConfig.js';");
  }
  text = text.replace('        this.activePlayers = [1, 2, 3, 4];', '        this.activePlayers = [...getCurrentBoardDefinition().players];');
  text = text.replace('    reset() { this.activePlayers = [1,2,3,4]; this.currentActiveIndex = 0; this.updatePlayerVisibility(); }',
    '    reset() { this.activePlayers = [...getCurrentBoardDefinition().players]; this.currentActiveIndex = 0; this.updatePlayerVisibility(); }');
  return text;
});

console.log('six-player network/config fixups applied');
