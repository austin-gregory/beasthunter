import * as Colyseus from "colyseus.js";

/*================================================
| Array with current online players
*/
let onlinePlayers = [];

/*================================================
| Colyseus connection with server
*/
const client = new Colyseus.Client("ws://localhost:3000");
let room = null;

function connectPlayer(playerProfile) {
    room = client.joinOrCreate("poke_world", playerProfile).then((joinedRoom) => {
        console.log(joinedRoom.sessionId, "joined", joinedRoom.name);
        return joinedRoom;
    }).catch((e) => {
        console.log("JOIN ERROR", e);
        throw e;
    });

    return room;
}

function getRoom() {
    return room;
}

export { onlinePlayers, connectPlayer, getRoom };
