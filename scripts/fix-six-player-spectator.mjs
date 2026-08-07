import fs from 'node:fs';

const patch = (file, fn) => {
  const text = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, fn(text));
};

patch('frontend/js/multiplayerGameManager.js', text => {
  if (!text.includes("import { prepareBoardForCurrentMode } from './sixPlayerBoardRenderer.js';")) {
    text = text.replace("import { playerIdManager } from './playerIdManager.js';", "import { playerIdManager } from './playerIdManager.js';\nimport { prepareBoardForCurrentMode } from './sixPlayerBoardRenderer.js';");
  }

  text = text.replace('gs.updateChessPosition(p, i, remote.position || 56);', 'gs.updateChessPosition(p, i, remote.position ?? gs.getFinishEnd());');

  const marker = `            // 初始化音频加载状态跟踪，确保后续 handleAudioLoaded 能正常工作
            this.audioLoadedPlayers = new Set();`;
  const replacement = `            // 观战在拿到服务器房间数据后才能确定是 classic4 还是 classic6。
            const spectatorBoardId = data.gameData?.boardId
                || data.gameSession?.gameData?.boardId
                || data.room?.settings?.boardId
                || (playersList.length > 4 ? 'classic6' : 'classic4');
            const spectatorConfig = {
                mode: 'online_multiplayer',
                boardId: spectatorBoardId,
                playerCount: playersList.length,
                pieceCount: data.room?.settings?.pieceCount || data.gameData?.pieceCount || 4,
                skillMode: data.room?.settings?.skillMode === true,
                happyMode: data.room?.settings?.happyMode === true
            };
            sessionStorage.setItem('gameConfig', JSON.stringify(spectatorConfig));

            if (gameState?.getBoardDefinition?.().id !== spectatorBoardId) {
                gameState.resetGameState();
                prepareBoardForCurrentMode();
                this.gameInstance?.setupChessElements?.();
            }

            // 初始化音频加载状态跟踪，确保后续 handleAudioLoaded 能正常工作
            this.audioLoadedPlayers = new Set();`;
  if (!text.includes(marker)) throw new Error('spectateJoined insertion marker not found');
  text = text.replace(marker, replacement);

  // 道具模式分支复用同一 spectatorConfig，不覆盖掉 boardId/playerCount/happyMode。
  text = text.replace(`                const configStr = sessionStorage.getItem('gameConfig');
                let config = configStr ? JSON.parse(configStr) : { mode: 'online_multiplayer' };
                config.skillMode = true;
                config.pieceCount = data.room.settings.pieceCount || 4;
                sessionStorage.setItem('gameConfig', JSON.stringify(config));`,
`                const config = { ...spectatorConfig, skillMode: true };
                sessionStorage.setItem('gameConfig', JSON.stringify(config));`);
  return text;
});

patch('frontend/js/spectateMain.js', text => {
  text = text.replaceAll('for (let i = 1; i <= 4; i++)', 'for (let i = 1; i <= 6; i++)');
  text = text.replaceAll('for (let player = 1; player <= 4; player++)', 'for (let player = 1; player <= 6; player++)');
  text = text.replaceAll('[1, 2, 3, 4].filter', '[1, 2, 3, 4, 5, 6].filter');
  return text;
});

console.log('six-player spectator integration fixups applied');
