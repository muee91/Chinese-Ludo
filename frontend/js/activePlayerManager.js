import { SUPPORTED_PLAYERS, getCurrentBoardDefinition } from './boards/boardConfig.js';

class ActivePlayerManager {
    constructor() {
        this.activePlayers = [...getCurrentBoardDefinition().players];
        this.currentActiveIndex = 0;
    }
    setActivePlayers(playerNumbers) {
        if (!Array.isArray(playerNumbers)) return;
        const normalized = playerNumbers.map(Number).filter(num => SUPPORTED_PLAYERS.includes(num));
        this.activePlayers = [...new Set(normalized)];
        this.currentActiveIndex = 0;
        this.updatePlayerVisibility();
    }
    getActivePlayers() { return [...this.activePlayers]; }
    isPlayerActive(playerNumber) { return this.activePlayers.includes(Number(playerNumber)); }
    getCurrentActivePlayer() { return this.activePlayers[this.currentActiveIndex] ?? 1; }
    getNextActivePlayer() {
        if (!this.activePlayers.length) return 1;
        this.currentActiveIndex = (this.currentActiveIndex + 1) % this.activePlayers.length;
        return this.activePlayers[this.currentActiveIndex];
    }
    setCurrentActivePlayer(playerNumber) {
        const index = this.activePlayers.indexOf(Number(playerNumber));
        if (index !== -1) this.currentActiveIndex = index;
    }
    updatePlayerVisibility() {
        for (const player of SUPPORTED_PLAYERS) {
            const isActive = this.isPlayerActive(player);
            document.querySelectorAll('.player-' + player + '-info').forEach(el => { el.style.display = isActive ? 'flex' : 'none'; el.style.visibility = isActive ? 'visible' : 'hidden'; });
            const progress = document.querySelector('.progress-item[data-player="' + player + '"]');
            if (progress) progress.style.display = isActive ? 'flex' : 'none';
            document.querySelectorAll('#board-svg use[href="#chess"].player-' + player).forEach(el => { el.style.display = isActive ? 'block' : 'none'; });
        }
    }
    getActivePlayerCount() { return this.activePlayers.length; }
    reset() { this.activePlayers = [...getCurrentBoardDefinition().players]; this.currentActiveIndex = 0; this.updatePlayerVisibility(); }
}
export const activePlayerManager = new ActivePlayerManager();
