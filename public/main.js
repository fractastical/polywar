// Connect to the Socket.io server
const socket = io();

// Game state
let playerId = null;
let gameId = null;
let players = {}; // All players in the game
let resources = 100;
let enemies = [];
let selectedPolygon = null;
let currentMode = 3; // Start with triangle selected
let mouseX = 0;
let mouseY = 0;
let gameStartTime = null;
let isGameEnded = false;
let zoomLevel = 1.0; // Initialize zoom level
let isAutomating = false; // Initialize automation state

// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Polygon information
const polygonInfo = {
    3: { name: "Triangle", cost: 10, size: 20, color: "#FF5733", speed: 2.0, combatDamage: 15 },
    4: { name: "Square", cost: 15, size: 25, color: "#33FF57", speed: 1.8, combatDamage: 20 },
    5: { name: "Pentagon", cost: 23, size: 30, color: "#3357FF", speed: 1.6, combatDamage: 25 },
    6: { name: "Hexagon", cost: 34, size: 35, color: "#F033FF", speed: 1.4, combatDamage: 30 },
    7: { name: "Heptagon", cost: 51, size: 40, color: "#FF33A1", speed: 1.2, combatDamage: 35 },
    8: { name: "Octagon", cost: 77, size: 45, color: "#33FFF6", speed: 1.0, combatDamage: 40 },
    9: { name: "Nonagon", cost: 115, size: 50, color: "#BFFF33", speed: 0.8, combatDamage: 45 }
};

let currentGameMode = 'producer'; // producer/combat/fighters modes

// Socket.io event handlers
socket.on('connect', () => {
    playerId = socket.id;
    console.log('Connected to server with ID:', playerId);

    // Join a game (use URL parameter or create a new one)
    const urlParams = new URLSearchParams(window.location.search);
    gameId = urlParams.get('game') || generateGameId();

    // Update URL to include game ID for sharing
    if (!urlParams.has('game')) {
        window.history.replaceState({}, '', `?game=${gameId}`);
    }

    socket.emit('joinGame', gameId);

    // Add game ID to the status display
    document.getElementById('status').innerHTML += `<div>Game ID: <span style="font-weight:bold">${gameId}</span> (Share this to play together)</div>`;
});

socket.on('gameState', (gameState) => {
    console.log('Received game state:', gameState);
    players = gameState.players || {};
    enemies = gameState.enemies || [];
    gameStartTime = gameState.startTime;

    // Update our local resources
    if (players[playerId]) {
        resources = players[playerId].resources;
    }

    updateDisplay();
    updateTimer();
});

socket.on('playerJoined', (player) => {
    console.log('Player joined:', player);
    players[player.id] = player;
    zoomLevel -= 0.1; // Zoom out by 10%
    zoomLevel = Math.max(0.2, zoomLevel); // Prevent zooming in too far
    updateDisplay();
});

socket.on('playerLeft', (data) => {
    console.log('Player left:', data.id);
    delete players[data.id];
    updateDisplay();
});

socket.on('polygonPlaced', (data) => {
    console.log('Polygon placed:', data);

    // Make sure the player object exists
    if (!players[data.ownerId]) {
        players[data.ownerId] = {
            id: data.ownerId,
            polygons: []
        };
    }

    // Make sure the polygons array exists
    if (!players[data.ownerId].polygons) {
        players[data.ownerId].polygons = [];
    }

    // Add the new polygon
    players[data.ownerId].polygons.push(data.polygon);

    // Update our resources if it's our polygon
    if (data.ownerId === playerId) {
        resources = data.resources;
        selectedPolygon = data.polygon;
    }

    updateDisplay();
});

socket.on('polygonMoved', (data) => {
    console.log('Polygon moved:', data);

    // Find the polygon and update its target
    if (players[data.ownerId] && players[data.ownerId].polygons) {
        const polygon = players[data.ownerId].polygons.find(p => p.id === data.polygonId);
        if (polygon) {
            polygon.targetX = data.targetX;
            polygon.targetY = data.targetY;
        }
    }
});

socket.on('polygonReplicated', (data) => {
    console.log('Polygon replicated:', data);

    // Make sure the player has a polygons array
    if (!players[data.ownerId].polygons) {
        players[data.ownerId].polygons = [];
    }

    // Add the new polygon
    players[data.ownerId].polygons.push(data.newPolygon);

    // Update our resources if it's our polygon
    if (data.ownerId === playerId) {
        resources = data.resources;
    }

    updateDisplay();
});

socket.on('resourceUpdate', (data) => {
    console.log('Resource update:', data);

    // Update resources for all players
    for (const pid in data.players) {
        if (players[pid]) {
            players[pid].resources = data.players[pid].resources;

            // Update our local resources variable if it's us
            if (pid === playerId) {
                resources = data.players[pid].resources;
            }
        }
    }

    updateDisplay();
});

socket.on('enemySpawned', (enemy) => {
    console.log('Enemy spawned:', enemy);
    enemies.push(enemy);
    updateDisplay();
});

socket.on('fighterSpawned', (fighter) => {
    console.log('Fighter spawned:', fighter);
    // Add the fighter to the enemies array
    enemies.push(fighter);
    console.log('Fighter added to game, total enemies:', enemies.length);
});

function findPolygonInGame(id) {
    for (const pid in players) {
        const player = players[pid];
        if (player.polygons) {
            const polygon = player.polygons.find(p => p.id === id);
            if (polygon) return polygon;
        }
    }
    return null;
}

// Mouse tracking
canvas.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
});

// Keyboard handling
window.addEventListener('keydown', (e) => {
    // T key cycles between producer/combat/fighters modes
    if (e.key === 't' || e.key === 'T') {
        if (currentGameMode === 'producer') {
            currentGameMode = 'combat';
        } else if (currentGameMode === 'combat') {
            currentGameMode = 'fighters';
        } else {
            currentGameMode = 'producer';
        }
        console.log("Mode toggled:", currentGameMode);
        updateModeDisplay();
    }

    // I key toggles instructions
    if (e.key === 'i' || e.key === 'I') {
        const info = document.getElementById('info');
        info.style.display = info.style.display === 'none' ? 'block' : 'none';
    }

    // N key toggles name input
    if (e.key === 'n' || e.key === 'N') {
        const nameInput = document.getElementById('nameInput');
        nameInput.style.display = nameInput.style.display === 'none' ? 'block' : 'none';
        if (nameInput.style.display === 'block') {
            document.getElementById('playerName').focus();
        }
    }

    // H key toggles tutorial
    if (e.key === 'h' || e.key === 'H') {
        const tutorial = document.getElementById('tutorial');
        tutorial.style.display = tutorial.style.display === 'none' ? 'block' : 'none';
    }

    // S key starts automation sequence
    if (e.key === 's' || e.key === 'S') {
        if (!isAutomating) {
            automationSystem.parseSequence(automationSequence);
            isAutomating = true;
            function automationLoop() {
                if (isAutomating) {
                    if (!automationSystem.executeNext()) {
                        isAutomating = false;
                    } else {
                        setTimeout(automationLoop, 500);
                    }
                }
            }
            automationLoop();
        }
    }

    // Number keys 3-9 select polygon type
    const keyNum = parseInt(e.key);
    if (!isNaN(keyNum) && keyNum >= 3 && keyNum <= 9) {
        currentMode = keyNum;
        updateModeDisplay();
    }

    // R key replicates selected polygon
    if (e.key === 'r' || e.key === 'R') {
        if (selectedPolygon) {
            const cost = polygonInfo[selectedPolygon.sides].cost;

            if (resources >= cost) {
                socket.emit('replicatePolygon', {
                    polygonId: selectedPolygon.id,
                    cost: cost
                });
            }
        }
    }

    // F key spawns a fighter from selected combat polygon
    if (e.key === 'f' || e.key === 'F') {
        if (selectedPolygon && selectedPolygon.isProducer === false) {
            console.log("Attempting to spawn fighter from polygon:", selectedPolygon.id);
            socket.emit('spawnFighter', {
                polygonId: selectedPolygon.id,
                gameId: gameId
            });

            // Add visual feedback
            selectedPolygon.lastSpawnTime = Date.now();
        } else {
            console.log("Cannot spawn fighter - no combat polygon selected");
        }
    }

    // Escape cancels placement mode
    if (e.key === 'Escape') {
        currentMode = null;
        updateModeDisplay();
    }
});

// Click to place, select, or move fighters
canvas.addEventListener('click', (e) => {
    if (currentGameMode === 'fighters' && selectedPolygon) {
        // Find all fighters of the same type
        const fighters = enemies.filter(enemy => 
            enemy.isFighter && 
            enemy.sides === selectedPolygon.sides && 
            enemy.ownerId === playerId
        );

        // Move all matching fighters to clicked location
        fighters.forEach(fighter => {
            fighter.targetX = e.clientX;
            fighter.targetY = e.clientY;
            socket.emit('movePolygon', {
                polygonId: fighter.id,
                targetX: e.clientX,
                targetY: e.clientY
            });
        });
        return;
    }
    if (currentMode !== null) {
        const cost = polygonInfo[currentMode].cost;
        if (resources >= cost) {
            const info = polygonInfo[currentMode];
            const isProducerMode = currentGameMode === 'producer';

            // Check if the placement location is within radius of own polygons and not overlapping
            let canPlace = true;
            const placementRadius = 150; // Maximum distance from existing polygons

            // Allow first polygon anywhere, subsequent ones need to be within radius
            if (players[playerId] && players[playerId].polygons && players[playerId].polygons.length > 0) {
                let withinRadius = false;
                for (const ownedPolygon of players[playerId].polygons) {
                    const distance = Math.sqrt(
                        Math.pow(ownedPolygon.x - e.clientX, 2) + 
                        Math.pow(ownedPolygon.y - e.clientY, 2)
                    );
                    if (distance <= placementRadius) {
                        withinRadius = true;
                        break;
                    }
                }
                if (!withinRadius) {
                    canPlace = false;
                }
            }

            // If within radius, check for overlaps with all players' polygons
            if (canPlace) {
                for (const pid in players) {
                    const player = players[pid];
                    if (player.polygons) {
                        for (const polygon of player.polygons) {
                            const distance = Math.sqrt(
                                Math.pow(polygon.x - e.clientX, 2) + 
                                Math.pow(polygon.y - e.clientY, 2)
                            );

                            // If distance is less than the sum of radii, they overlap
                            if (distance < polygon.size + info.size) {
                                canPlace = false;
                                break;
                            }
                        }
                    }
                }
            }

            // Also check collision with enemies
            for (const enemy of enemies) {
                const distance = Math.sqrt(
                    Math.pow(enemy.x - e.clientX, 2) + 
                    Math.pow(enemy.y - e.clientY, 2)
                );

                if (distance < enemy.size + info.size) {
                    canPlace = false;
                    break;
                }
            }

            if (canPlace) {
                socket.emit('placePolygon', {
                    x: (e.clientX - canvas.width / 2) / zoomLevel,
                    y: (e.clientY - canvas.height / 2) / zoomLevel,
                    sides: currentMode,
                    size: info.size,
                    cost: cost,
                    isProducer: currentGameMode === 'producer'
                });
            }
        }
    } else {
        // Select polygon - only select our own polygons
        selectedPolygon = null;

        if (players[playerId] && players[playerId].polygons) {
            // Check from last to first (top to bottom in rendering)
            for (let i = players[playerId].polygons.length - 1; i >= 0; i--) {
                const polygon = players[playerId].polygons[i];
                const distance = Math.sqrt(
                    Math.pow(polygon.x - e.clientX, 2) + 
                    Math.pow(polygon.y - e.clientY, 2)
                );

                if (distance <= polygon.size) {
                    selectedPolygon = polygon;
                    break;
                }
            }
        }
    }
});

// Right-click to move selected polygon
canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (selectedPolygon) {
        socket.emit('movePolygon', {
            polygonId: selectedPolygon.id,
            targetX: e.clientX,
            targetY: e.clientY
        });
    }
});

// Generate a random game ID
function generateGameId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Update UI displays
function updateDisplay() {
    document.getElementById('resources').textContent = resources;

    // Count how many polygons each player has
    let totalPolygons = 0;
    for (const pid in players) {
        if (players[pid].polygons) {
            totalPolygons += players[pid].polygons.length;
        }
    }

    // Update polygon count display
    let myPolygonCount = players[playerId] && players[playerId].polygons ? players[playerId].polygons.length : 0;
    document.getElementById('polygonCount').textContent = `${myPolygonCount} (Total: ${totalPolygons})`;

    // Update enemy count
    document.getElementById('enemyCount').textContent = enemies.length;
}

// Update mode display
function updateModeDisplay() {
    if (currentMode === null) {
        document.getElementById('currentMode').textContent = currentGameMode.charAt(0).toUpperCase() + currentGameMode.slice(1);
    } else {
        const info = polygonInfo[currentMode];
        const type = currentGameMode.charAt(0).toUpperCase() + currentGameMode.slice(1);
        const suffix = currentGameMode === 'fighters' ? 'Move' : `Cost: ${info.cost}`;
        document.getElementById('currentMode').textContent = 
            `${info.name} - ${type} (${suffix})`;
    }
}

// Draw a polygon
function drawPolygon(polygon, isSelected, isOwned = true, isEnemy = false) {
    ctx.save();
    ctx.translate(polygon.x, polygon.y);
    ctx.rotate(polygon.rotation || 0);
    ctx.scale(zoomLevel, zoomLevel); // Apply zoom

    // Draw pulse effect for combat polygons that just spawned
    if (polygon.lastSpawnTime && !polygon.isProducer) {
        const timeSinceSpawn = Date.now() - polygon.lastSpawnTime;
        if (timeSinceSpawn < 1000) { // Show pulse for 1 second
            const pulseSize = polygon.size + (20 * Math.sin((timeSinceSpawn / 1000) * Math.PI));
            ctx.beginPath();
            ctx.arc(0, 0, pulseSize, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 165, 0, ${0.6 * (1 - timeSinceSpawn/1000)})`;
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 215, 0, 0.8)';
            ctx.lineWidth = 3;
            ctx.stroke();
        }
    }

    // Draw selection circle if selected
    if (isSelected) {
        ctx.beginPath();
        ctx.arc(0, 0, polygon.size + 5, 0, Math.PI * 2);
        ctx.strokeStyle = 'yellow';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // Draw movement line for selected polygon
    if (isSelected && polygon.targetX !== null && polygon.targetY !== null) {
        ctx.beginPath();
        ctx.setLineDash([5, 5]);
        ctx.moveTo(0, 0);
        ctx.lineTo(polygon.targetX - polygon.x, polygon.targetY - polygon.y);
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Draw the polygon
    ctx.beginPath();
    for (let i = 0; i < polygon.sides; i++) {
        const angle = (i * 2 * Math.PI / polygon.sides) + (polygon.rotation || 0);
        const x = polygon.size * Math.cos(angle);
        const y = polygon.size * Math.sin(angle);

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.closePath();

    // Fill with appropriate color
    if (isEnemy) {
        ctx.fillStyle = 'red';
    } else {
        ctx.fillStyle = polygon.color;

        // Make other players' polygons semi-transparent
        if (!isOwned) {
            ctx.globalAlpha = 0.7;
        }
    }

    ctx.fill();
    ctx.globalAlpha = 1.0; // Reset alpha

    // Draw outline
    if (isEnemy) {
        ctx.strokeStyle = "#800000";
    } else if (isOwned) {
        ctx.strokeStyle = polygon.isProducer ? "#00FFFF" : "#FFD700"; // Cyan for producer, Gold for combat - needs server-side update
    } else {
        ctx.strokeStyle = "#AAAAAA";
    }
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw the number in the center
    ctx.fillStyle = 'white';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(polygon.sides.toString(), 0, 0);

    ctx.restore();
}

function drawFighter(enemy, parent) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(enemy.rotation || 0);
    ctx.scale(zoomLevel, zoomLevel); // Apply zoom

    // Draw glow
    ctx.beginPath();
    ctx.arc(0, 0, enemy.size + 5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 0, 0.2)`;
    ctx.fill();

    // Draw fighter polygon
    ctx.beginPath();
    for (let i = 0; i < enemy.sides; i++) {
        const angle = (i * 2 * Math.PI / enemy.sides);
        const x = enemy.size * Math.cos(angle);
        const y = enemy.size * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = parent.color;
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    // Draw number
    ctx.fillStyle = 'white';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(enemy.sides.toString(), 0, 0);

    ctx.restore();
}


// Draw placement preview
function drawPlacementPreview() {
    if (currentMode !== null) {
        const info = polygonInfo[currentMode];
        const placementRadius = 150;

        // Check if the placement location is within radius and valid
        let canPlace = false;

        // Check if within radius of any owned polygon
        if (players[playerId] && players[playerId].polygons) {
            for (const ownedPolygon of players[playerId].polygons) {
                const distance = Math.sqrt(
                    Math.pow(ownedPolygon.x - mouseX, 2) + 
                    Math.pow(ownedPolygon.y - mouseY, 2)
                );
                if (distance <= placementRadius) {
                    canPlace = true;
                    break;
                }
            }
        }

        // If within radius, check for overlaps
        // Check against all players' polygons
        for (const pid in players) {
            const player = players[pid];
            if (player.polygons) {
                for (const polygon of player.polygons) {
                    const distance = Math.sqrt(
                        Math.pow(polygon.x - mouseX, 2) + 
                        Math.pow(polygon.y - mouseY, 2)
                    );

                    if (distance < polygon.size + info.size) {
                        canPlace = false;
                        break;
                    }
                }
            }
        }

        // Also check collision with enemies
        for (const enemy of enemies) {
            const distance = Math.sqrt(
                Math.pow(enemy.x - mouseX, 2) + 
                Math.pow(enemy.y - mouseY, 2)
            );

            if (distance < enemy.size + info.size) {
                canPlace = false;
                break;
            }
        }

        ctx.save();
        ctx.translate(mouseX - canvas.width/2, mouseY - canvas.height/2);
        ctx.scale(zoomLevel, zoomLevel); // Apply zoom

        // Draw placement area indicator circle
        ctx.beginPath();
        ctx.arc(0, 0, info.size, 0, Math.PI * 2);
        ctx.fillStyle = canPlace ? 'rgba(100, 255, 100, 0.2)' : 'rgba(255, 100, 100, 0.2)';
        ctx.fill();

        // Draw polygon outline
        ctx.beginPath();
        for (let i = 0; i < currentMode; i++) {
            const angle = (i * 2 * Math.PI / currentMode);
            const x = info.size * Math.cos(angle);
            const y = info.size * Math.sin(angle);

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();

        // Semi-transparent fill
        ctx.fillStyle = canPlace ? info.color + '80' : '#FF000080'; // Add 50% transparency
        ctx.fill();

        ctx.strokeStyle = canPlace ? 'white' : 'red';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw number in center of preview
        ctx.fillStyle = 'white';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(currentMode.toString(), 0, 0);

        ctx.restore();
    }
}

// Game render function
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save(); // Save the context before transformations
    ctx.translate(canvas.width / 2, canvas.height / 2); // Center the canvas
    ctx.scale(zoomLevel, zoomLevel); // Apply zoom

    // Draw placement preview
    drawPlacementPreview();

    // Draw all players' polygons
    for (const pid in players) {
        const player = players[pid];
        if (player && player.polygons) {
            for (const polygon of player.polygons) {
                const isSelected = (polygon === selectedPolygon);
                const isOwnedByMe = (pid === playerId);
                drawPolygon(polygon, isSelected, isOwnedByMe);
            }
        }
    }

    // Draw enemy polygons and fighters
    for (const enemy of enemies) {
        if (enemy.parentId) {
            const parent = findPolygonInGame(enemy.parentId);
            if (parent) {
                drawFighter(enemy, parent);
            }
        } else {
            drawPolygon(enemy, false, false, true);
        }
    }

    ctx.restore(); // Restore the context after drawing
}

// Game loop
function gameLoop() {
    // Local updates (just for animations)
    // Polygon movements are now handled by the server
    // but we still need to animate rotations
    for (const pid in players) {
        const player = players[pid];
        if (player && player.polygons) {
            for (const polygon of player.polygons) {
                // Rotate slowly
                polygon.rotation = (polygon.rotation || 0) + 0.01;

                // Simple position interpolation for smoother movement
                if (polygon.targetX !== null && polygon.targetY !== null) {
                    const dx = polygon.targetX - polygon.x;
                    const dy = polygon.targetY - polygon.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance > 5) {
                        const info = polygonInfo[polygon.sides];
                        const speed = info ? info.speed : 1.5;
                        polygon.x += (dx / distance) * speed;
                        polygon.y += (dy / distance) * speed;
                    } else {
                        polygon.targetX = null;
                        polygon.targetY = null;
                    }
                }
            }
        }
    }

    // Rotate and move enemies and fighters
    for (const enemy of enemies) {
        enemy.rotation = (enemy.rotation || 0) + 0.01;

        // Simple position interpolation for smoother movement
        if (enemy.targetX !== null && enemy.targetY !== null) {
            const dx = enemy.targetX - enemy.x;
            const dy = enemy.targetY - enemy.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 5) {
                const baseSpeed = enemy.isFighter ? 2.0 : 0.75; // Fighters move faster
                const speed = enemy.speed || baseSpeed;
                enemy.x += (dx / distance) * speed;
                enemy.y += (dy / distance) * speed;

                // If it reaches target, set new random target for regular enemies
                // Only regular enemies get new random targets
                if (!enemy.isFighter && distance < 10) {
                    enemy.targetX = Math.random() * canvas.width;
                    enemy.targetY = Math.random() * canvas.height;
                } else if (enemy.isFighter && distance < 10) {
                    // Fighters keep going in the same direction off screen
                    const dx = enemy.targetX - enemy.x;
                    const dy = enemy.targetY - enemy.y;
                    const angle = Math.atan2(dy, dx);
                    enemy.targetX = enemy.x + Math.cos(angle) * 2000;
                    enemy.targetY = enemy.y + Math.sin(angle) * 2000;
                }
            }
        }
    }

    render();
    requestAnimationFrame(gameLoop);
}

// Handle window resize
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

// Timer functions
function updateTimer() {
    if (isGameEnded) return;
    const now = Date.now();
    const timeLeft = Math.max(0, 300000 - (now - gameStartTime)); // 5 minutes = 300000 milliseconds
    const minutes = Math.floor(timeLeft / 60000);
    const seconds = Math.floor((timeLeft % 60000) / 1000);
    document.getElementById('timer').textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    if (timeLeft > 0) {
        setTimeout(updateTimer, 1000);
    } else {
        socket.emit('endGame');
    }
}


socket.on('gameEnd', (data) => {
    isGameEnded = true;
    const leaderboard = document.getElementById('leaderboard');
    const scoresDiv = document.getElementById('scores');

    const currentScores = data.scores.map(score => 
        `<div style="color: ${score.color}">Player: ${score.id === playerId ? 'YOU' : 'Player'} - Score: ${score.score}</div>`
    ).join('');

    const history = data.history ? `
        <div style="margin-top: 20px; border-top: 1px solid #ccc;">
            <h3>Past Winners</h3>
            ${data.history.slice(-5).reverse().map(entry => `
                <div style="margin: 5px 0">
                    ${new Date(entry.timestamp).toLocaleTimeString()}: 
                    ${entry.scores.map((s, i) => `#${i + 1}: Score ${s.score}`).join(', ')}
                </div>
            `).join('')}
        </div>
    ` : '';

    scoresDiv.innerHTML = currentScores + 
        '<div style="margin-top: 10px">New game starting in 20 seconds...</div>' +
        history;

    leaderboard.style.display = 'block';
});

socket.on('gameRestart', (game) => {
    isGameEnded = false;
    gameStartTime = Date.now();
    selectedPolygon = null;
    resources = 100;
    zoomLevel = 1.0; // Reset zoom level
    players = game.players || {}; // Update with new game state
    enemies = game.enemies || [];
    document.getElementById('leaderboard').style.display = 'none';
    updateTimer();
    updateDisplay();
});

// Start everything
updateModeDisplay();
gameLoop();