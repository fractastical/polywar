// Game state
let gameId = null;
let playerId = null;
let players = {};
let enemies = [];
let selectedPolygon = null;
let currentMode = null;
let mouseX = 0;
let mouseY = 0;

// Connect to the server
const socket = io();

// Setup canvas
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Polygon information
const polygonInfo = {
    3: { name: "Triangle", cost: 10, size: 20, speed: 2.0 },
    4: { name: "Square", cost: 15, size: 25, speed: 1.8 },
    5: { name: "Pentagon", cost: 20, size: 30, speed: 1.6 },
    6: { name: "Hexagon", cost: 25, size: 35, speed: 1.4 },
    7: { name: "Heptagon", cost: 30, size: 40, speed: 1.2 },
    8: { name: "Octagon", cost: 35, size: 45, speed: 1.0 },
    9: { name: "Nonagon", cost: 40, size: 50, speed: 0.8 }
};

// When connecting to server
socket.on('connect', () => {
    playerId = socket.id;
    console.log('Connected to server with ID:', playerId);
    
    // Join a game (use URL parameter or create a new one)
    const urlParams = new URLSearchParams(window.location.search);
    gameId = urlParams.get('game') || generateGameId();
    
    // Update URL to include game ID
    if (!urlParams.has('game')) {
        window.history.replaceState({}, '', `?game=${gameId}`);
    }
    
    socket.emit('joinGame', gameId);
    
    document.getElementById('status').innerHTML += `<div>Game ID: ${gameId}</div>`;
});

// Handle game state updates
socket.on('gameState', (gameState) => {
    players = gameState.players;
    enemies = gameState.enemies;
    updateDisplay();
});

socket.on('playerJoined', (player) => {
    players[player.id] = player;
    console.log('Player joined:', player.id);
    updateDisplay();
});

socket.on('playerLeft', (data) => {
    delete players[data.id];
    console.log('Player left:', data.id);
    updateDisplay();
});

socket.on('polygonPlaced', (data) => {
    players[data.ownerId].polygons.push(data.polygon);
    players[data.ownerId].resources = data.resources;
    updateDisplay();
});

socket.on('polygonMoved', (data) => {
    const player = players[data.ownerId];
    const polygon = player.polygons.find(p => p.id === data.polygonId);
    if (polygon) {
        polygon.targetX = data.targetX;
        polygon.targetY = data.targetY;
    }
});

socket.on('polygonReplicated', (data) => {
    players[data.ownerId].polygons.push(data.newPolygon);
    players[data.ownerId].resources = data.resources;
    updateDisplay();
});

socket.on('resourceUpdate', (data) => {
    for (const playerId in data.players) {
        if (players[playerId]) {
            players[playerId].resources = data.players[playerId].resources;
        }
    }
    updateDisplay();
});

// Mouse and keyboard handling
canvas.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
});

canvas.addEventListener('click', (e) => {
    if (currentMode !== null) {
        const cost = polygonInfo[currentMode].cost;
        const info = polygonInfo[currentMode];
        
        // Check for collisions with existing polygons
        let canPlace = true;
        
        for (const pid in players) {
            const player = players[pid];
            for (const polygon of player.polygons) {
                const distance = Math.sqrt(
                    Math.pow(polygon.x - e.clientX, 2) + 
                    Math.pow(polygon.y - e.clientY, 2)
                );
                
                if (distance < polygon.size + info.size) {
                    canPlace = false;
                    break;
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
        
        if (canPlace && players[playerId].resources >= cost) {
            socket.emit('placePolygon', {
                x: e.clientX,
                y: e.clientY,
                sides: currentMode,
                size: info.size,
                cost: cost
            });
        }
    } else {
        // Select polygon
        selectedPolygon = null;
        if (players[playerId]) {
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

window.addEventListener('keydown', (e) => {
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
            if (players[playerId].resources >= cost) {
                socket.emit('replicatePolygon', {
                    polygonId: selectedPolygon.id,
                    cost: cost
                });
            }
        }
    }
    
    // Escape cancels placement mode
    if (e.key === 'Escape') {
        currentMode = null;
        updateModeDisplay();
    }
});

// Utility functions
function generateGameId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function updateDisplay() {
    if (players[playerId]) {
        document.getElementById('resources').textContent = players[playerId].resources;
        
        let totalPlayerPolygons = 0;
        for (const pid in players) {
            totalPlayerPolygons += players[pid].polygons.length;
        }
        
        document.getElementById('polygonCount').textContent = totalPlayerPolygons;
        document.getElementById('enemyCount').textContent = enemies.length;
    }
}

function updateModeDisplay() {
    if (currentMode === null) {
        document.getElementById('currentMode').textContent = "None";
    } else {
        const info = polygonInfo[currentMode];
        document.getElementById('currentMode').textContent = 
            `${info.name} (Cost: ${info.cost})`;
    }
}

// Game rendering
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw placement preview
    drawPlacementPreview();
    
    // Draw player polygons
    for (const pid in players) {
        const player = players[pid];
        for (const polygon of player.polygons) {
            const isSelected = (polygon === selectedPolygon);
            const isOwned = (pid === playerId);
            drawPolygon(polygon, isSelected, isOwned);
        }
    }
    
    // Draw enemies
    for (const enemy of enemies) {
        drawPolygon(enemy, false, false, true);
    }
    
    requestAnimationFrame(render);
}

function drawPlacementPreview() {
    if (currentMode !== null) {
        const info = polygonInfo[currentMode];
        
        // Check if placement location is valid
        let canPlace = true;
        
        for (const pid in players) {
            const player = players[pid];
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
        
        // Check collision with enemies
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
        ctx.translate(mouseX, mouseY);
        
        // Draw placement area
        ctx.beginPath();
        ctx.arc(0, 0, info.size, 0, Math.PI * 2);
        ctx.fillStyle = canPlace ? 'rgba(100, 255, 100, 0.2)' : 'rgba(255, 100, 100, 0.2)';
        ctx.fill();
        
        // Draw polygon preview
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
        
        ctx.fillStyle = canPlace ? 
            (players[playerId] ? players[playerId].color + '80' : '#FFFFFF80') : 
            '#FF000080';
        ctx.fill();
        
        ctx.strokeStyle = canPlace ? 'white' : 'red';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Draw number
        ctx.fillStyle = 'white';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(currentMode.toString(), 0, 0);
        
        ctx.restore();
    }
}

function drawPolygon(polygon, isSelected, isOwned, isEnemy = false) {
    ctx.save();
    ctx.translate(polygon.x, polygon.y);
    ctx.rotate(polygon.rotation);
    
    // Draw selection circle
    if (isSelected) {
        ctx.beginPath();
        ctx.arc(0, 0, polygon.size + 5, 0, Math.PI * 2);
        ctx.strokeStyle = 'yellow';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    
    // Draw movement line
    if (isSelected && polygon.targetX !== null) {
        ctx.beginPath();
        ctx.setLineDash([5, 5]);
        ctx.moveTo(0, 0);
        ctx.lineTo(polygon.targetX - polygon.x, polygon.targetY - polygon.y);
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
    }
    
    // Draw polygon
    ctx.beginPath();
    for (let i = 0; i < polygon.sides; i++) {
        const angle = (i * 2 * Math.PI / polygon.sides) + polygon.rotation;
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
    ctx.fillStyle = isEnemy ? 'red' : polygon.color;
    
    // Make other player's polygons semi-transparent
    if (!isOwned && !isEnemy) {
        ctx.globalAlpha = 0.7;
    }
    
    ctx.fill();
    ctx.globalAlpha = 1.0;
    
    // Draw outline
    ctx.strokeStyle = isEnemy ? '#800000' : (isOwned ? '#FFFFFF' : '#AAAAAA');
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw number
    ctx.fillStyle = 'white';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(polygon.sides.toString(), 0, 0);
    
    ctx.restore();
}

// Start the game
window.onload = () => {
    updateModeDisplay();
    render();
};

// Handle window resize
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});