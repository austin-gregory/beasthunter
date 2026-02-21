export const PLAYER_MODELS = [
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
];

export function isValidModel(model) {
    return PLAYER_MODELS.includes(model);
}

export function sanitizePlayerName(name) {
    const trimmed = (name || "").trim().replace(/\s+/g, " ");
    if (!trimmed) {
        return "Player";
    }

    return trimmed.slice(0, 16);
}
