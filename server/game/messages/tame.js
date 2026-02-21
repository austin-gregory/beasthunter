const { tryTame } = require("../state");

function handleTame(room, state, client) {
    const p = state.players[client.sessionId];
    if (!p || p.dead || p.hp <= 0) return;
    tryTame(state, p);
}

module.exports = { handleTame };
