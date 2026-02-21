function handlePlayerChangedMap(room, state, client, data) {
    const p = state.players[client.sessionId];
    if (!p || !data || !data.map || p.dead) return;

    p.map = data.map;
    if (Number.isFinite(data.x) && Number.isFinite(data.y)) {
        p.x = data.x;
        p.y = data.y;
    }

    client.send("CURRENT_PLAYERS", { players: state.players });
    room.broadcast("PLAYER_CHANGED_MAP", {
        sessionId: p.sessionId,
        name: p.name,
        model: p.model,
        bow: Number.isFinite(p.bow) ? p.bow : 0,
        map: p.map,
        x: p.x,
        y: p.y
    });
}

module.exports = { handlePlayerChangedMap };
