const { respawnPlayer } = require("../state");

function handleRespawn(room, state, client) {
    const p = state.players[client.sessionId];
    if (!p || !p.dead) return;
    respawnPlayer(state, p);
}

module.exports = { handleRespawn };
