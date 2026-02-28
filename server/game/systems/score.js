const { isInAnySafe, respawnBeast } = require("../state");
const { SCORE_CASHIN_PER_BEAST } = require("../constants");

function tryCashIn(state) {
    for (const p of Object.values(state.players)) {
        if (!p.team) continue;
        if (!isInAnySafe(p.map, p.x, p.y)) continue;

        const myBeasts = state.beasts.filter(b => b.tamedBy === p.sessionId);
        if (!myBeasts.length) continue;

        const seen = new Set();
        let pts = 0;
        for (const b of myBeasts) {
            if (!seen.has(b.key)) { seen.add(b.key); pts += SCORE_CASHIN_PER_BEAST; }
        }

        if (p.team === 1) state.team1Score += pts;
        else if (p.team === 2) state.team2Score += pts;

        for (const b of myBeasts) respawnBeast(b);
    }
}

module.exports = { tryCashIn };
