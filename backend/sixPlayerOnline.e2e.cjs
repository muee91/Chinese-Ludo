const assert = require('node:assert/strict');
const WebSocket = require('ws');

const WS_URL = process.env.SIX_PLAYER_WS_URL || 'ws://127.0.0.1:3101';
const HTTP_URL = process.env.SIX_PLAYER_HTTP_URL || 'http://127.0.0.1:3101';

class TestClient {
  constructor(index) {
    this.index = index;
    this.playerId = `player_e2e${String(index).padStart(2, '0')}`;
    this.nickname = `联机玩家${index}`;
    this.ws = null;
    this.messages = [];
    this.waiters = [];
  }

  async connect() {
    this.ws = new WebSocket(WS_URL);
    this.ws.on('message', raw => {
      const message = JSON.parse(String(raw));
      this.messages.push(message);
      this.flushWaiters();
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`client ${this.index} websocket open timeout`)), 5000);
      this.ws.once('open', () => { clearTimeout(timer); resolve(); });
      this.ws.once('error', error => { clearTimeout(timer); reject(error); });
    });
    this.send({ type: 'identify' });
    const connected = await this.waitFor(message => message.type === 'connected');
    assert.equal(connected.playerId, this.playerId);
  }

  send(message) {
    this.ws.send(JSON.stringify({ playerId: this.playerId, ...message }));
  }

  waitFor(predicate, timeout = 5000) {
    const existingIndex = this.messages.findIndex(predicate);
    if (existingIndex >= 0) return Promise.resolve(this.messages.splice(existingIndex, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error(`client ${this.index} message timeout; buffered=${JSON.stringify(this.messages.slice(-6))}`));
      }, timeout);
      this.waiters.push(waiter);
    });
  }

  flushWaiters() {
    for (const waiter of [...this.waiters]) {
      const index = this.messages.findIndex(waiter.predicate);
      if (index < 0) continue;
      const [message] = this.messages.splice(index, 1);
      clearTimeout(waiter.timer);
      this.waiters.splice(this.waiters.indexOf(waiter), 1);
      waiter.resolve(message);
    }
  }

  close() {
    try { this.ws?.close(); } catch {}
  }
}

async function getJson(path) {
  const response = await fetch(`${HTTP_URL}${path}`);
  assert.equal(response.ok, true, `${path} HTTP ${response.status}`);
  return response.json();
}

(async () => {
  const clients = Array.from({ length: 7 }, (_, index) => new TestClient(index + 1));
  try {
    await Promise.all(clients.map(client => client.connect()));

    const host = clients[0];
    host.send({ type: 'createRoom', data: { nickname: host.nickname, emoji: 'smile' } });
    const created = await host.waitFor(message => message.type === 'roomCreated');
    const roomCode = created.room.code;
    assert.match(roomCode, /^[A-Z]{4}$/);
    assert.equal(created.room.players.length, 1);
    assert.equal(created.room.players[0].color, 1);
    assert.equal(created.room.settings.maxPlayers, 6);

    for (let index = 1; index < 6; index++) {
      const client = clients[index];
      client.send({
        type: 'join_room',
        data: { roomCode, nickname: client.nickname, emoji: 'smile' }
      });
      const joined = await client.waitFor(message => message.type === 'roomJoined');
      assert.equal(joined.room.players.length, index + 1);
      const own = joined.room.players.find(player => player.id === client.playerId);
      assert.ok(own, `player ${index + 1} missing from joined room`);
      assert.equal(own.color, index + 1, `player ${index + 1} color`);
    }

    const sixthRoom = await getJson('/api/rooms');
    const waitingRoom = sixthRoom.rooms.find(room => room.code === roomCode);
    assert.ok(waitingRoom, 'six-player waiting room missing');
    assert.equal(waitingRoom.players.length, 6);
    assert.deepEqual(waitingRoom.players.map(player => player.color).sort((a, b) => a - b), [1,2,3,4,5,6]);
    assert.equal(waitingRoom.settings.maxPlayers, 6);

    // 第7名真实玩家必须被拒绝，不能占用第7个席位。
    const extra = clients[6];
    extra.send({
      type: 'join_room',
      data: { roomCode, nickname: extra.nickname, emoji: 'smile' }
    });
    const fullError = await extra.waitFor(message => message.type === 'error');
    assert.equal(fullError.message, '房间已满');

    // 2~6号玩家全部准备；房主本身自动准备。
    for (let index = 1; index < 6; index++) {
      const client = clients[index];
      client.send({ type: 'toggle_ready', data: { isReady: true } });
      const ready = await host.waitFor(message =>
        message.type === 'playerReadyStatusChanged' &&
        message.playerId === client.playerId &&
        message.isReady === true
      );
      assert.equal(ready.isReady, true);
    }

    host.send({ type: 'start_game' });
    const started = await host.waitFor(message => message.type === 'gameStarted', 7000);
    assert.equal(started.boardId, 'classic6');
    assert.equal(started.playerCount, 6);
    assert.equal(started.pieceCount, 4);
    assert.equal(started.room.settings.boardId, 'classic6');
    assert.equal(started.room.settings.maxPlayers, 6);
    assert.equal(started.room.gameState, 'playing');

    // 所有6个正式玩家都应收到同一个 classic6 开局广播。
    for (let index = 1; index < 6; index++) {
      const peerStarted = await clients[index].waitFor(message => message.type === 'gameStarted', 7000);
      assert.equal(peerStarted.gameSessionId, started.gameSessionId);
      assert.equal(peerStarted.boardId, 'classic6');
      assert.equal(peerStarted.playerCount, 6);
    }

    const rooms = await getJson('/api/rooms');
    const playingRoom = rooms.rooms.find(room => room.code === roomCode);
    assert.ok(playingRoom, 'playing room missing');
    assert.equal(playingRoom.gameState, 'playing');
    assert.equal(playingRoom.settings.boardId, 'classic6');
    assert.equal(playingRoom.players.length, 6);

    const sessions = await getJson('/api/sessions');
    const session = sessions.sessions.find(item => item.sessionId === started.gameSessionId);
    assert.ok(session, 'six-player session missing');
    assert.equal(session.playerCount, 6);
    assert.equal(session.pieceCount, 4);
    assert.deepEqual(session.players.map(player => player.playerNumber).sort((a,b) => a-b), [1,2,3,4,5,6]);
    assert.equal(session.gameState.currentPlayer, 1);
    assert.equal(session.gameState.gamePhase, 'rolling');

    // 被拒绝的第7人仍可作为观战者加入；观战恢复数据必须携带六人棋盘及6套棋子。
    extra.send({ type: 'spectate_room', data: { roomCode } });
    const spectator = await extra.waitFor(message => message.type === 'spectateJoined', 7000);
    assert.equal(spectator.gameData.boardId, 'classic6');
    assert.equal(spectator.gameData.playerCount, 6);
    assert.equal(spectator.gameData.pieceCount, 4);
    assert.deepEqual(Object.keys(spectator.gameData.playerChess).map(Number).sort((a,b) => a-b), [1,2,3,4,5,6]);
    for (const player of [1,2,3,4,5,6]) {
      assert.equal(spectator.gameData.playerChess[player].length, 4, `player ${player} server chess count`);
      assert.deepEqual(spectator.gameData.playerChess[player].map(piece => piece.position), [-1,-1,-1,-1]);
    }

    console.log(JSON.stringify({
      roomCode,
      gameSessionId: started.gameSessionId,
      boardId: started.boardId,
      players: playingRoom.players.map(player => ({ id: player.id, color: player.color })),
      spectatorBoardId: spectator.gameData.boardId,
      serverPlayerChessKeys: Object.keys(spectator.gameData.playerChess)
    }, null, 2));
    console.log('six-player online room e2e passed');
  } finally {
    for (const client of clients) client.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
