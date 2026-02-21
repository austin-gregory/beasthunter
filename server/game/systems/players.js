const { PLAYER_MAX_HP, PLAYER_MAX_AMMO } = require("../constants");
const { isInAnySafe } = require("../state");

function updatePlayers(state, dt) {
    for (const p of Object.values(state.players)) {
        if (p.dead) continue;

        if (isInAnySafe(p.map, p.x, p.y)) {
            p.ammo = PLAYER_MAX_AMMO;
            p.hp = Math.min(PLAYER_MAX_HP, p.hp + 30 * dt);
        }
    }
}

module.exports = { updatePlayers };
