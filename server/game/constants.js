const VALID_MODELS = new Set([
    "misa",
    "bob",
    "boss",
    "femaletrainer",
    "girl1",
    "knight",
    "ninja",
    "nurse",
    "omnichannelceo",
    "omnichannelfemale",
    "professor",
    "red",
    "teamxerogrunt1",
    "tuxemartemployee"
]);
const MAP_TOWN = "town";

const PLAYER_MAX_HP = 100;
const PLAYER_MAX_AMMO = 30;
const PLAYER_RADIUS = 16;
const BEAST_MELEE_RANGE_BONUS = 24;

const TAME_HP_RATIO = 0.2;
const TAME_RANGE = 96;

const ARROW_MIN_SPEED = 220;
const ARROW_MAX_SPEED = 420;
const ARROW_MIN_DMG = 8;
const ARROW_MAX_DMG = 32;
const ARROW_RADIUS = 9;
const ARROW_LIFE = 2.3;
const FOLLOW_BACK_BASE = 56;
const FOLLOW_BACK_ROW = 28;
const FOLLOW_SIDE_GAP = 24;
const FOLLOW_OWNER_MIN_GAP = 42;


const ENEMY_TYPES = {
    wolf: { label: "Wolf", hp: 80, size: 16, speed: 62, score: 12 },
    tiger: { label: "Tiger", hp: 95, size: 17, speed: 66, score: 15 },
    spider: { label: "Big Spider", hp: 65, size: 15, speed: 72, score: 10 }
};

module.exports = {
    VALID_MODELS,
    MAP_TOWN,
    PLAYER_MAX_HP,
    PLAYER_MAX_AMMO,
    PLAYER_RADIUS,
    BEAST_MELEE_RANGE_BONUS,
    TAME_HP_RATIO,
    TAME_RANGE,
    ARROW_MIN_SPEED,
    ARROW_MAX_SPEED,
    ARROW_MIN_DMG,
    ARROW_MAX_DMG,
    ARROW_RADIUS,
    ARROW_LIFE,
    FOLLOW_BACK_BASE,
    FOLLOW_BACK_ROW,
    FOLLOW_SIDE_GAP,
    FOLLOW_OWNER_MIN_GAP,
    ENEMY_TYPES
};
