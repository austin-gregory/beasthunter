const { isInAnySafe, respawnBeast } = require("../state");

function tryCashIn(state) {
    for (const p of Object.values(state.players)) {
        if (!isInAnySafe(p.map, p.x, p.y)) continue;

        const carried = { wolf: false, tiger: false, spider: false };
        for (const b of state.beasts) {
            if (b.tamedBy === p.sessionId) carried[b.key] = true;
        }

        if (carried.wolf && carried.tiger && carried.spider) {
            p.score += 100;
            for (const b of state.beasts) {
                if (b.tamedBy === p.sessionId) {
                    respawnBeast(b);
                }
            }
        }
    }
}

module.exports = { tryCashIn };
