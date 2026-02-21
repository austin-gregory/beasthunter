function handlePlayerMovementEnded(room, state, client, data) {
    const p = state.players[client.sessionId];
    if (!p || !data || p.dead) return;

    p.dir = data.position || p.dir || "front";
    room.broadcast(
        "PLAYER_MOVEMENT_ENDED",
        {
            sessionId: p.sessionId,
            map: p.map,
            position: p.dir
        },
        { except: client }
    );
}

module.exports = { handlePlayerMovementEnded };
