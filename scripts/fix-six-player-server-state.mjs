import fs from 'node:fs';

const file = 'backend/server.cjs';
let text = fs.readFileSync(file, 'utf8');

if (!text.includes('function getSessionBoardBounds(gameData)')) {
  const anchor = "// -------------------------- 房间管理类 --------------------------";
  const helper = `function getSessionBoardBounds(gameData) {
  const isSix = gameData?.boardId === 'classic6' || Number(gameData?.playerCount) > 4;
  return isSix
    ? { outerEnd: 76, finishStart: 77, finishEnd: 82 }
    : { outerEnd: 50, finishStart: 51, finishEnd: 56 };
}

`;
  if (!text.includes(anchor)) throw new Error('missing RoomManager anchor');
  text = text.replace(anchor, helper + anchor);
}

// 三处服务器棋子完成状态同步统一使用当前会话棋盘终点。
text = text.replaceAll('if (finalPosition === 56) {', "if (finalPosition === getSessionBoardBounds(target.gameData).finishEnd) {");
text = text.replaceAll('if (toPosition === 56) {', "if (toPosition === getSessionBoardBounds(gameSession.gameData).finishEnd) {");
text = text.replaceAll('if (position === 56) {', "if (position === getSessionBoardBounds(gameSession.gameData).finishEnd) {");

// 服务器无可移动棋子 fallback：四人仍0-50/51-56，六人变0-76/77-82。
const oldFallback = `              const canLaunch = diceVal % 2 === 0;
              const hasMovable = chessArray.some(c => {
                if (c.finished) return false;
                const pos = c.position;
                if (pos === undefined || pos === null || pos === -1) return canLaunch;
                if (pos >= 0 && pos <= 50) return true;
                if (pos >= 51 && pos < 56) return true;
                return false;
              });`;
const newFallback = `              const canLaunch = diceVal % 2 === 0;
              const boardBounds = getSessionBoardBounds(gameSession.gameData);
              const hasMovable = chessArray.some(c => {
                if (c.finished) return false;
                const pos = c.position;
                if (pos === undefined || pos === null || pos === -1) return canLaunch;
                if (pos >= 0 && pos <= boardBounds.outerEnd) return true;
                if (pos >= boardBounds.finishStart && pos < boardBounds.finishEnd) return true;
                return false;
              });`;
if (text.includes(oldFallback)) text = text.replace(oldFallback, newFallback);

// 六人房间上限的三处关键断言必须已迁移，防止未来脚本只改了一半。
if (text.includes('totalPlayerCount >= 4')) throw new Error('server still contains 4-player room capacity check');
if (text.includes('Number(maxPlayers) > 4')) throw new Error('server contains undefined maxPlayers board expression');

fs.writeFileSync(file, text);
console.log('six-player server state fixups applied');
