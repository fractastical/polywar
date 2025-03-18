const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Serve static files
app.use(express.static('public'));

// Game state
const games = {};
const players = {};

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('New player connected:', socket.id);
  
  // Create a new player
  players[socket.id] = {
    id: socket.id,
    color: getRandomColor(),
    resources: 100,
    polygons: []
  };
  
  // Join or create a game
  socket.on('joinGame', (gameId) => {
    // Create game if it doesn't exist
    if (!games[gameId]) {
      games[gameId] = {
        id: gameId,
        players: {},
        enemies: [],
        lastUpdate: Date.now()
      };
    }
    
    // Add player to game
    games[gameId].players[socket.id] = players[socket.id];
    socket.join(gameId);
    socket.gameId = gameId;
    
    // Inform player about game state
    socket.emit('gameState', games[gameId]);
    
    // Inform other players about the new player
    socket.to(gameId).emit('playerJoined', {
      id: socket.id,
      color: players[socket.id].color
    });
  });
  
  // Handle player actions
  socket.on('placePolygon', (data) => {
    if (!socket.gameId || !games[socket.gameId]) return;
    
    const player = players[socket.id];
    const game = games[socket.gameId];
    
    // Check if player has enough resources
    if (player.resources >= data.cost) {
      // Create the polygon
      const newPolygon = {
        id: Date.now() + Math.random(),
        x: data.x,
        y: data.y,
        sides: data.sides,
        size: data.size,
        color: player.color,
        ownerId: socket.id,
        rotation: 0,
        targetX: null,
        targetY: null
      };
      
      // Add the polygon to the player's collection
      player.resources -= data.cost;
      player.polygons.push(newPolygon);
      
      // Broadcast the new polygon to all players in the game
      io.to(socket.gameId).emit('polygonPlaced', {
        polygon: newPolygon,
        ownerId: socket.id,
        resources: player.resources
      });
    }
  });
  
  socket.on('movePolygon', (data) => {
    if (!socket.gameId) return;
    
    const polygon = findPolygon(players[socket.id].polygons, data.polygonId);
    if (polygon) {
      polygon.targetX = data.targetX;
      polygon.targetY = data.targetY;
      
      // Broadcast the move to all players
      io.to(socket.gameId).emit('polygonMoved', {
        polygonId: data.polygonId,
        ownerId: socket.id,
        targetX: data.targetX,
        targetY: data.targetY
      });
    }
  });
  
  socket.on('replicatePolygon', (data) => {
    if (!socket.gameId) return;
    
    const player = players[socket.id];
    const originalPolygon = findPolygon(player.polygons, data.polygonId);
    
    if (originalPolygon && player.resources >= data.cost) {
      player.resources -= data.cost;
      
      const newPolygon = {
        id: Date.now() + Math.random(),
        x: originalPolygon.x + (Math.random() * 40 - 20),
        y: originalPolygon.y + (Math.random() * 40 - 20),
        sides: originalPolygon.sides,
        size: originalPolygon.size,
        color: player.color,
        ownerId: socket.id,
        rotation: 0,
        targetX: null,
        targetY: null
      };
      
      player.polygons.push(newPolygon);
      
      io.to(socket.gameId).emit('polygonReplicated', {
        newPolygon: newPolygon,
        originalPolygonId: data.polygonId,
        ownerId: socket.id,
        resources: player.resources
      });
    }
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    
    if (socket.gameId && games[socket.gameId]) {
      // Remove player from game
      delete games[socket.gameId].players[socket.id];
      
      // Inform other players
      io.to(socket.gameId).emit('playerLeft', {
        id: socket.id
      });
      
      // Remove game if empty
      if (Object.keys(games[socket.gameId].players).length === 0) {
        delete games[socket.gameId];
      }
    }
    
    // Remove player
    delete players[socket.id];
  });
});

// Helper functions
function getRandomColor() {
  const colors = [
    "#FF5733", "#33FF57", "#3357FF", "#F033FF", 
    "#FF33A1", "#33FFF6", "#BFFF33", "#FFD700"
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

function findPolygon(polygons, id) {
  return polygons.find(p => p.id === id);
}

// Game loop
setInterval(() => {
  // Update each game
  for (const gameId in games) {
    const game = games[gameId];
    const now = Date.now();
    const deltaTime = now - game.lastUpdate;
    game.lastUpdate = now;
    
    // Update enemy positions
    updateEnemies(game, deltaTime);
    
    // Check for collisions
    checkCollisions(game);
    
    // Generate resources
    if (Math.random() < 0.1) {
      for (const playerId in game.players) {
        game.players[playerId].resources++;
      }
      // Broadcast resource update
      io.to(gameId).emit('resourceUpdate', { 
        players: Object.fromEntries(
          Object.entries(game.players).map(([id, player]) => 
            [id, { resources: player.resources }]
          )
        )
      });
    }
    
    // Occasionally spawn new enemies
    if (Math.random() < 0.01 && game.enemies.length < 20) {
      spawnEnemy(game);
    }
  }
}, 100);

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});