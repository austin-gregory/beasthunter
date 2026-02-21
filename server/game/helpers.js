function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function vecFromDir(dir) {
    if (dir === "left") return { x: -1, y: 0 };
    if (dir === "right") return { x: 1, y: 0 };
    if (dir === "back") return { x: 0, y: -1 };
    return { x: 0, y: 1 };
}

function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function random(min, max) {
    return min + Math.random() * (max - min);
}

module.exports = {
    clamp,
    lerp,
    vecFromDir,
    dist,
    random
};
