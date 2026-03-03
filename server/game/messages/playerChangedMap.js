const INTERIOR_MAPS = new Set(["interior_door_a", "interior_door_b"]);
const { respawnBeast } = require("../state");
const { WOLF_COMPANION_HP, MAP_TOWN } = require("../constants");
const { getTeamSpawn, getSpawnPoints } = require("../maps");

// Resolve the entry spawn in `toMap` when coming from `fromMap`.
// Looks for a SpawnPoint with a 'map' property matching fromMap; falls back to first spawn.
function getWorldEntrySpawn(toMap, fromMap) {
    const spawns = getSpawnPoints(toMap);
    const match = spawns.find((sp) =>
        sp.properties.some((p) => p.name === "map" && p.value === fromMap)
    );
    if (match) return { x: match.x, y: match.y };
    if (spawns.length) return { x: spawns[0].x, y: spawns[0].y };
    return null;
}

const WOLF_SUMMON_DELAY = 15; // seconds

function handlePlayerChangedMap(room, state, client, data) {
    const p = state.players[client.sessionId];
    if (!p || !data || !data.map || p.dead) return;

    const prevMap = p.map;

    // Entering an interior — start wolf summon countdown if eligible
    if (INTERIOR_MAPS.has(data.map) && p.wolfHp === 0 && !p.wolfSummonCountdown) {
        const ownedTypes = new Set(
            state.beasts.filter(b => b.tamedBy === client.sessionId).map(b => b.key)
        );
        if (ownedTypes.has("wolf") && ownedTypes.has("tiger") && ownedTypes.has("spider")) {
            p.wolfSummonCountdown = WOLF_SUMMON_DELAY;
            // Small delay so the client scene has time to restart and register handlers
            setTimeout(() => {
                if (state.players[client.sessionId] && p.wolfSummonCountdown > 0) {
                    client.send("BEAST_SUMMONING", { duration: WOLF_SUMMON_DELAY });
                }
            }, 300);
        }
    }

    // Leaving an interior — cancel any pending summon
    if (INTERIOR_MAPS.has(prevMap) && !INTERIOR_MAPS.has(data.map)) {
        p.wolfSummonCountdown = 0;
    }

    p.map = data.map;

    // Determine spawn position in the new map
    if (data.map === MAP_TOWN && INTERIOR_MAPS.has(prevMap)) {
        // Returning from a building → team spawn
        const sp = getTeamSpawn(p.team);
        p.x = sp.x;
        p.y = sp.y;
    } else if (!INTERIOR_MAPS.has(data.map) && !INTERIOR_MAPS.has(prevMap)) {
        // World-to-world transition (town ↔ route1, town ↔ route2, etc.)
        // Use the SpawnPoint in the target map that corresponds to the source map
        const sp = getWorldEntrySpawn(data.map, prevMap);
        if (sp) { p.x = sp.x; p.y = sp.y; }
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
