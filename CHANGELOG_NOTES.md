# Workspace Change Summary

Note: This workspace did not have a `.git` directory, so a full diff is not available. This file summarizes changes made so far.

## Client
- `client/src/SceneMenu.js`
  - Replaced title with `beasthuntermenu.png` logo; adjusted position.
  - Reworked menu UI to single-tile pickers with arrows for model and bow selection.
  - Added bow selection (A/D) and model selection (left/right) plus click arrows.

- `client/src/Scene1.js`
  - Loads bow spritesheet and arrow image.
  - Loads wolf spritesheet and creates `beast-wolf-walk` animation.

- `client/src/Scene2.js`
  - Bow behavior: visible only while charging or shooting; shoot anims per bow.
  - Added damage popups for players and beasts.
  - Added boss sync + rendering for interior spider boss (green HP bar, green blood, damage numbers).
  - Added interior beast transform: circle first, then dramatic beam + shake + “BEAST SUMMONED” text, then wolf.
  - Arrow projectiles now use `arrow.png` instead of triangles.
  - Safe zone, tamed-beast handling, and cleanup updated to include boss + new FX.

- `client/src/Player.js`
  - Bow-specific shoot animation keys (per selected bow).

- `client/src/OnlinePlayer.js`
  - Bow visibility only during shooting for remote players.
  - Shoot animations use bow-specific keys.

- `client/src/playerModels.js`
  - Expanded model list to all available atlas models.

## Server
- `server/game/maps.js`
  - New: map metadata loader (safe zones, beast areas, spawn points).

- `server/game/constants.js`
  - Expanded `VALID_MODELS` list.

- `server/game/state.js`
  - Added bosses list, boss spawn, and helpers for boss lookups.
  - Reload areas drive safe zones; spawn + beast areas drive behavior.

- `server/rooms/PokeWorld.js`
  - Spawns bosses on room creation.

- `server/game/net.js`
  - Adds bosses and bow to game state payload.

- `server/game/systems/beasts.js`
  - Tamed beasts attack interior boss when present.

- `server/game/systems/projectiles.js`
  - Arrows can damage boss but cannot kill it (HP floor 1).

- `server/game/systems/players.js`
  - Reload/safe zones now map-based (not only town).

- `server/game/systems/score.js`
  - Safe-zone checks are map-based.

- `server/game/messages/playerChangedMap.js`
  - Broadcast includes bow.

- `server/game/messages/shoot.js`
  - Broadcasts `PLAYER_SHOT`.

- `server/game/messages/tame.js`
  - Tame allowed on any map.
