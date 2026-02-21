function handlePlayerMoved(room, state, client, data) {
    const p = state.players[client.sessionId];
    if (!p || !data || p.dead) return;

    p.x = data.x;
    p.y = data.y;
    p.dir = data.position || p.dir || "front";

    room.broadcast(
        "PLAYER_MOVED",
        {
            sessionId: p.sessionId,
            name: p.name,
            model: p.model,
            map: p.map,
            x: p.x,
            y: p.y,
            position: p.dir
        },
        { except: client }
    );
}

module.exports = { handlePlayerMoved };
