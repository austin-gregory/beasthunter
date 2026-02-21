# Simple realtime platform game build with Phaser.io
**Simple realtime Pokemon game build with Phaser 3, Colyseus.io & Webpack 4.**

![PokeMMO](https://github.com/aaron5670/PokeMMO-Online-Realtime-Multiplayer-Game/blob/master/docs/images/PokeMMO.gif?raw=true)

### Features & ToDo
- [x] Multiple players can join the game
- [x] Maps are can be created/edited with [Tiled Map Editor](https://www.mapeditor.org/)
- [x] Multiple levels/maps
- [ ] Pokémons added
- [ ] Can going inside building (In progress)

### Scoring And Beasts
- Outside beasts are shown as colored circles: wolf = gray, tiger = orange, spider = purple.
- Cash-in: if you are in a safe zone with all three tamed beasts, you gain 100 points and your tamed beasts respawn.
- Boss spider (inside buildings) gives 100 points to the player whose tamed beast finishes it.

### How to install
```
// Clone this repository
$ git clone https://github.com/aaron5670/PokeMMO-Online-Realtime-Multiplayer-Game.git

// Go to the client folder and install all modules
$ cd client && npm install

// Go to the server folder and install all modules
$ cd ../server && npm install

// Start the server
$ node server.js

// Open a new terminal and navigate to the client folder and start the webpack server
$ cd client && npm start
```
After successfully install go to [http://localhost:8080](http://localhost:8080/)
