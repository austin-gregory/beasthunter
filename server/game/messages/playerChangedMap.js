const INTERIOR_MAPS = new Set(["interior_door_a", "interior_door_b"]);
const { respawnBeast } = require("../state");
const { WOLF_COMPANION_HP, MAP_TOWN } = require("../constants");
const { getTeamSpawn } = require("../maps");

function handlePlayerChangedMap(room, state, client, data) {
    const p = state.players[client.sessionId];
    if (!p || !data || !data.map || p.dead) return;

    if (INTERIOR_MAPS.has(data.map) && p.wolfHp === 0) {
        const ownedTypes = new Set(
            state.beasts.filter(b => b.tamedBy === client.sessionId).map(b => b.key)
        );
        if (ownedTypes.has("wolf") && ownedTypes.has("tiger") && ownedTypes.has("spider")) {
            for (const b of state.beasts) {
                if (b.tamedBy === client.sessionId) respawnBeast(b);
            }
            p.wolfHp = WOLF_COMPANION_HP;
            room.broadcast("BEAST_SUMMONED", { sessionId: client.sessionId });
        }
    }

    const prevMap = p.map;
    p.map = data.map;

    // When returning to town from a building, always spawn at the player's own
    // team area so they can't end up stuck inside the enemy zone.
    if (data.map === MAP_TOWN && INTERIOR_MAPS.has(prevMap)) {
        const sp = getTeamSpawn(p.team);
        p.x = sp.x;
        p.y = sp.y;
    } else if (Number.isFinite(data.x) && Number.isFinite(data.y)) {
        p.x = data.x;
        p.y = data.y;
    }

    client.send("CURRENT_PLAYERS", { players: state.players });
    room.broadcast("PLAYER_CHANGED_MAP", {
        sessionId: p.sessionId,
        name: p.name,
        model: p.model,
        bow: Number.isFinite(p.bow) ? p.bow : 0,
        team: p.team || 0,
        map: p.map,
        x: p.x,
        y: p.y
    });
}

module.exports = { handlePlayerChangedMap };
