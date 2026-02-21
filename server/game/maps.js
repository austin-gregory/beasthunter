const fs = require("fs");
const path = require("path");
const { random } = require("./helpers");

const DEFAULT_BOUNDS = { width: 1280, height: 1280 };
const TILEMAPS_DIR = path.resolve(__dirname, "..", "..", "client", "src", "assets", "tilemaps");

const cache = new Map();
let loadedAll = false;

function loadAllMaps() {
    if (loadedAll) return;
    loadedAll = true;
    let entries = [];
    try {
        entries = fs.readdirSync(TILEMAPS_DIR);
    } catch (err) {
        console.warn("[maps] Failed to read tilemaps dir:", err.message);
        return;
    }

    for (const file of entries) {
        if (!file.endsWith(".json")) continue;
        const mapName = file.replace(/\.json$/i, "");
        loadMap(mapName);
    }
}

function loadMap(mapName) {
    if (cache.has(mapName)) return cache.get(mapName);
    const filePath = path.join(TILEMAPS_DIR, `${mapName}.json`);
    let data;
    try {
        data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (err) {
        console.warn(`[maps] Failed to load map ${mapName}:`, err.message);
        return null;
    }

    const width = Number(data.width) || 0;
    const height = Number(data.height) || 0;
    const tilewidth = Number(data.tilewidth) || 0;
    const tileheight = Number(data.tileheight) || 0;

    const bounds = {
        width: width * tilewidth || DEFAULT_BOUNDS.width,
        height: height * tileheight || DEFAULT_BOUNDS.height
    };

    const layers = Array.isArray(data.layers) ? data.layers : [];

    const getObjectLayer = (name) => layers.find((l) => l && l.type === "objectgroup" && l.name === name);

    const extractAreas = (name) => {
        const layer = getObjectLayer(name);
        const objects = layer && Array.isArray(layer.objects) ? layer.objects : [];
        return objects
            .map((o) => ({
                x: Number(o.x) || 0,
                y: Number(o.y) || 0,
                w: Number(o.width) || 0,
                h: Number(o.height) || 0
            }))
            .filter((a) => a.w > 0 && a.h > 0);
    };

    const spawnLayer = getObjectLayer("SpawnPoints");
    const spawnPoints = spawnLayer && Array.isArray(spawnLayer.objects)
        ? spawnLayer.objects
            .filter((o) => o && o.name === "Spawn Point")
            .map((o) => ({
                x: Number(o.x) || 0,
                y: Number(o.y) || 0,
                properties: Array.isArray(o.properties) ? o.properties : []
            }))
        : [];

    const meta = {
        name: mapName,
        bounds,
        reloadAreas: extractAreas("Reload Area"),
        beastAreas: extractAreas("Beast Area"),
        spawnPoints
    };

    cache.set(mapName, meta);
    return meta;
}

function getMapMeta(mapName) {
    loadAllMaps();
    return cache.get(mapName) || null;
}

function getMapBounds(mapName) {
    const meta = getMapMeta(mapName);
    return meta ? meta.bounds : DEFAULT_BOUNDS;
}

function getReloadAreas(mapName) {
    const meta = getMapMeta(mapName);
    return meta ? meta.reloadAreas : [];
}

function getBeastAreas(mapName) {
    const meta = getMapMeta(mapName);
    return meta ? meta.beastAreas : [];
}

function getSpawnPoints(mapName) {
    const meta = getMapMeta(mapName);
    return meta ? meta.spawnPoints : [];
}

function getAllSafeZones() {
    loadAllMaps();
    const zones = [];
    for (const meta of cache.values()) {
        for (const area of meta.reloadAreas) {
            zones.push({ map: meta.name, x: area.x, y: area.y, w: area.w, h: area.h });
        }
    }
    return zones;
}

function getMapsWithBeastAreas() {
    loadAllMaps();
    const maps = [];
    for (const meta of cache.values()) {
        if (meta.beastAreas.length > 0) maps.push(meta);
    }
    return maps;
}

function pickRandomPointInAreas(areas, bounds) {
    if (!areas.length) {
        const w = bounds ? bounds.width : DEFAULT_BOUNDS.width;
        const h = bounds ? bounds.height : DEFAULT_BOUNDS.height;
        return { x: random(160, Math.max(160, w - 160)), y: random(260, Math.max(260, h - 260)) };
    }
    const area = areas[Math.floor(random(0, areas.length))];
    const x = random(area.x + 8, area.x + Math.max(8, area.w - 8));
    const y = random(area.y + 8, area.y + Math.max(8, area.h - 8));
    return { x, y };
}

function getReloadSpawn(mapName, slot) {
    const areas = getReloadAreas(mapName);
    if (!areas.length) return null;
    const index = Number.isFinite(slot) ? slot % areas.length : 0;
    const area = areas[index] || areas[0];
    return { x: area.x + area.w / 2, y: area.y + area.h / 2 };
}

function getFallbackSpawn(mapName) {
    const spawns = getSpawnPoints(mapName);
    if (!spawns.length) return null;
    return { x: spawns[0].x, y: spawns[0].y };
}

module.exports = {
    DEFAULT_BOUNDS,
    getMapMeta,
    getMapBounds,
    getReloadAreas,
    getBeastAreas,
    getSpawnPoints,
    getAllSafeZones,
    getMapsWithBeastAreas,
    pickRandomPointInAreas,
    getReloadSpawn,
    getFallbackSpawn
};
