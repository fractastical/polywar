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
    socket.to(gameId).emit('playerJoined', players[socket.id]);
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
        targetY: null,
        isProducer: data.isProducer
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

// Add the missing functions
function updateEnemies(game, deltaTime) {
  // Move enemies toward their targets
  for (const enemy of game.enemies) {
    if (enemy.targetX !== null && enemy.targetY !== null) {
      const dx = enemy.targetX - enemy.x;
      const dy = enemy.targetY - enemy.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > 5) {
        // Enemy speed based on sides (fewer sides = faster)
        const speed = 0.5 + (3 - Math.min(enemy.sides, 9)) * 0.1;
        enemy.x += (dx / distance) * speed;
        enemy.y += (dy / distance) * speed;
      } else {
        // Pick a new random target
        enemy.targetX = Math.random() * 1000;
        enemy.targetY = Math.random() * 600;
      }
    }
    
    // Rotate the enemy
    enemy.rotation = (enemy.rotation || 0) + 0.01;
  }
}

function checkCollisions(game) {
  // For each player's polygons
  for (const playerId in game.players) {
    const player = game.players[playerId];
    
    // Skip if player has no polygons
    if (!player.polygons) continue;
    
    // Check each polygon
    for (let i = player.polygons.length - 1; i >= 0; i--) {
      const polygon = player.polygons[i];
      
      // Check against enemies
      for (let j = game.enemies.length - 1; j >= 0; j--) {
        const enemy = game.enemies[j];
        
        const dx = polygon.x - enemy.x;
        const dy = polygon.y - enemy.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < polygon.size + enemy.size) {
          // Player polygon wins if it has exactly one more side
          if (polygon.sides === enemy.sides + 1) {
            game.enemies.splice(j, 1);
            player.resources += Math.floor(enemy.sides * 5);
            
            // Send enemy removed event
            io.to(game.id).emit('enemyRemoved', {
              enemyId: enemy.id,
              playerId: playerId
            });
            
            break;
          }
          // Enemy wins if it has exactly one more side
          else if (enemy.sides === polygon.sides + 1) {
            player.polygons.splice(i, 1);
            
            // Send polygon removed event
            io.to(game.id).emit('polygonRemoved', {
              polygonId: polygon.id,
              playerId: playerId
            });
            
            break;
          }
        }
      }
    }
  }
}

function spawnEnemy(game) {
  const sides = Math.floor(Math.random() * 7) + 3; // 3 to 9 sides
  
  // Size and speed based on sides
  const size = 15 + (sides - 3) * 5;
  const speed = 2.0 - (sides - 3) * 0.2;
  
  const enemy = {
    id: Date.now() + Math.random(),
    x: 1000 + Math.random() * 100, // Spawn off screen to the right
    y: Math.random() * 600,
    sides: sides,
    size: size,
    color: 'red',
    rotation: 0,
    targetX: Math.random() * 800,
    targetY: Math.random() * 600,
    speed: speed
  };
  
  game.enemies.push(enemy);
  
  // Inform all players about the new enemy
  io.to(game.id).emit('enemySpawned', enemy);
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
    
    // Generate resources based on producers
    if (Math.random() < 0.1) {
      for (const playerId in game.players) {
        const player = game.players[playerId];
        if (player.polygons) {
          const producers = player.polygons.filter(p => p.isProducer);
          const resourceGain = producers.reduce((sum, p) => sum + (p.size / 20), 0);
          if (resourceGain > 0) {
            player.resources += resourceGain;
          }
        }
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