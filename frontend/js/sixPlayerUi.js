function cloneColorOption(container, player) {
    if (!container || container.querySelector('[data-player="' + player + '"]')) return;
    const template = container.querySelector('.color-option');
    if (!template) return;
    const option = template.cloneNode(true);
    option.dataset.player = String(player);
    option.classList.remove('selected', 'disabled', 'occupied');
    const circle = option.querySelector('.color-circle');
    if (circle) circle.className = 'color-circle player-' + player + '-color';
    container.appendChild(option);
}

export function installSixPlayerIndexUI() {
    const containers = [
        document.getElementById('localHumanColorOptions'),
        document.getElementById('colorOptions'),
        document.getElementById('multiplayerColorOptions')
    ].filter(Boolean);
    containers.forEach(container => { cloneColorOption(container, 5); cloneColorOption(container, 6); });

    document.querySelectorAll('.color-options').forEach(container => {
        if (container.querySelector('[data-player="1"]') && container.querySelector('[data-player="4"]')) {
            cloneColorOption(container, 5); cloneColorOption(container, 6);
        }
    });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installSixPlayerIndexUI, { once: true });
else installSixPlayerIndexUI();
