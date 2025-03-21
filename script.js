// Connect to the Socket.io server
const socket = io();

// Game state
let playerId = null;
let gameId = null;
let players = {}; // All players in the game
let resources = 100;
let enemies = [];
let selectedPolygon = null;
let currentMode = null;
let mouseX = 0;
let mouseY = 0;

// Canvas setup
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Polygon information
const polygonInfo = {
    3: { name: "Triangle", cost: 10, size: 20, color: "#FF5733", speed: 2.0 },
    4: { name: "Square", cost: 15, size: 25, color: "#33FF57", speed: 1.8 },
    5: { name: "Pentagon", cost: 20, size: 30, color: "#3357FF", speed: 1.6 },
    6: { name: "Hexagon", cost: 25, size: 35, color: "#F033FF", speed: 1.4 },
    7: { name: "Heptagon", cost: 30, size: 40, color: "#FF33A1", speed: 1.2 },
    8: { name: "Octagon", cost: 35, size: 45, color: "#33FFF6", speed: 1.0 },
    9: { name: "Nonagon", cost: 40, size: 50, color: "#BFFF33", speed: 0.8 },
};

// Socket.io event handlers
socket.on("connect", () => {
    playerId = socket.id;
    console.log("Connected to server with ID:", playerId);

    // Join a game (use URL parameter or create a new one)
    const urlParams = new URLSearchParams(window.location.search);
    gameId = urlParams.get("game") || generateGameId();

    // Update URL to include game ID for sharing
    if (!urlParams.has("game")) {
        window.history.replaceState({}, "", `?game=${gameId}`);
    }

    socket.emit("joinGame", gameId);

    // Add game ID to the status display
    document.getElementById("status").innerHTML +=
        `<div>Game ID: <span style="font-weight:bold">${gameId}</span> (Share this to play together)</div>`;
});

socket.on("gameState", (gameState) => {
    console.log("Received game state:", gameState);
    players = gameState.players || {};
    enemies = gameState.enemies || [];

    // Update our local resources
    if (players[playerId]) {
        resources = players[playerId].resources;
    }

    updateDisplay();
});

socket.on("playerJoined", (player) => {
    console.log("Player joined:", player);
    players[player.id] = player;
    updateDisplay();
});

socket.on("playerLeft", (data) => {
    console.log("Player left:", data.id);
    delete players[data.id];
    updateDisplay();
});

socket.on("polygonPlaced", (data) => {
    console.log("Polygon placed:", data);

    // Make sure the player object exists
    if (!players[data.ownerId]) {
        players[data.ownerId] = {
            id: data.ownerId,
            polygons: [],
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

socket.on("polygonMoved", (data) => {
    console.log("Polygon moved:", data);

    // Find the polygon and update its target
    if (players[data.ownerId] && players[data.ownerId].polygons) {
        const polygon = players[data.ownerId].polygons.find(
            (p) => p.id === data.polygonId,
        );
        if (polygon) {
            polygon.targetX = data.targetX;
            polygon.targetY = data.targetY;
        }
    }
});

socket.on("polygonReplicated", (data) => {
    console.log("Polygon replicated:", data);

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

socket.on("resourceUpdate", (data) => {
    console.log("Resource update:", data);

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

socket.on("enemySpawned", (enemy) => {
    console.log("Enemy spawned:", enemy);
    enemies.push(enemy);
    updateDisplay();
});

// Mouse tracking
canvas.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
});

// Keyboard handling
window.addEventListener("keydown", (e) => {
    // Number keys 3-9 select polygon type
    const keyNum = parseInt(e.key);
    if (!isNaN(keyNum) && keyNum >= 3 && keyNum <= 9) {
        currentMode = keyNum;
        updateModeDisplay();
    }

    // R key replicates selected polygon
    if (e.key === "r" || e.key === "R") {
        if (selectedPolygon) {
            const cost = polygonInfo[selectedPolygon.sides].cost;

            if (resources >= cost) {
                socket.emit("replicatePolygon", {
                    polygonId: selectedPolygon.id,
                    cost: cost,
                });
            }
        }
    }

    // Escape cancels placement mode
    if (e.key === "Escape") {
        currentMode = null;
        updateModeDisplay();
    }
});

// Click to place or select polygons
canvas.addEventListener("click", (e) => {
    if (currentMode !== null) {
        const cost = polygonInfo[currentMode].cost;
        if (resources >= cost) {
            const info = polygonInfo[currentMode];

            // Check if the placement location overlaps with existing polygons
            let canPlace = true;

            // Check against all players' polygons
            for (const pid in players) {
                const player = players[pid];
                if (player.polygons) {
                    for (const polygon of player.polygons) {
                        const distance = Math.sqrt(
                            Math.pow(polygon.x - e.clientX, 2) +
                                Math.pow(polygon.y - e.clientY, 2),
                        );

                        // If distance is less than the sum of radii, they overlap
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
                    Math.pow(enemy.x - e.clientX, 2) +
                        Math.pow(enemy.y - e.clientY, 2),
                );

                if (distance < enemy.size + info.size) {
                    canPlace = false;
                    break;
                }
            }

            if (canPlace) {
                socket.emit("placePolygon", {
                    x: e.clientX,
                    y: e.clientY,
                    sides: currentMode,
                    size: info.size,
                    cost: cost,
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
                        Math.pow(polygon.y - e.clientY, 2),
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
canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (selectedPolygon) {
        socket.emit("movePolygon", {
            polygonId: selectedPolygon.id,
            targetX: e.clientX,
            targetY: e.clientY,
        });
    }
});

// Generate a random game ID
function generateGameId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Update UI displays
function updateDisplay() {
    document.getElementById("resources").textContent = resources;

    // Count how many polygons each player has
    let totalPolygons = 0;
    for (const pid in players) {
        if (players[pid].polygons) {
            totalPolygons += players[pid].polygons.length;
        }
    }

    // Update polygon count display
    let myPolygonCount =
        players[playerId] && players[playerId].polygons
            ? players[playerId].polygons.length
            : 0;
    document.getElementById("polygonCount").textContent =
        `${myPolygonCount} (Total: ${totalPolygons})`;

    // Update enemy count
    document.getElementById("enemyCount").textContent = enemies.length;
}

// Update mode display
function updateModeDisplay() {
    if (currentMode === null) {
        document.getElementById("currentMode").textContent = "None";
    } else {
        const info = polygonInfo[currentMode];
        document.getElementById("currentMode").textContent =
            `${info.name} (Cost: ${info.cost})`;
    }
}

// Draw a polygon
function drawPolygon(polygon, isSelected, isOwned = true, isEnemy = false) {
    ctx.save();
    ctx.translate(polygon.x, polygon.y);
    ctx.rotate(polygon.rotation || 0);

    // Draw selection circle if selected
    if (isSelected) {
        ctx.beginPath();
        ctx.arc(0, 0, polygon.size + 5, 0, Math.PI * 2);
        ctx.strokeStyle = "yellow";
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // Draw movement line for selected polygon
    if (isSelected && polygon.targetX !== null && polygon.targetY !== null) {
        ctx.beginPath();
        ctx.setLineDash([5, 5]);
        ctx.moveTo(0, 0);
        ctx.lineTo(polygon.targetX - polygon.x, polygon.targetY - polygon.y);
        ctx.strokeStyle = "rgba(255, 255, 0, 0.5)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Draw the polygon
    ctx.beginPath();
    for (let i = 0; i < polygon.sides; i++) {
        const angle =
            (i * 2 * Math.PI) / polygon.sides + (polygon.rotation || 0);
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
        ctx.fillStyle = "red";
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
    ctx.strokeStyle = isEnemy ? "#800000" : isOwned ? "#FFFFFF" : "#AAAAAA";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw the number in the center
    ctx.fillStyle = "white";
    ctx.font = "14px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(polygon.sides.toString(), 0, 0);

    ctx.restore();
}

// Draw placement preview
function drawPlacementPreview() {
    if (currentMode !== null) {
        const info = polygonInfo[currentMode];

        // Check if the placement location is valid
        let canPlace = true;

        // Check against all players' polygons
        for (const pid in players) {
            const player = players[pid];
            if (player.polygons) {
                for (const polygon of player.polygons) {
                    const distance = Math.sqrt(
                        Math.pow(polygon.x - mouseX, 2) +
                            Math.pow(polygon.y - mouseY, 2),
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
                Math.pow(enemy.x - mouseX, 2) + Math.pow(enemy.y - mouseY, 2),
            );

            if (distance < enemy.size + info.size) {
                canPlace = false;
                break;
            }
        }

        ctx.save();
        ctx.translate(mouseX, mouseY);

        // Draw placement area indicator circle
        ctx.beginPath();
        ctx.arc(0, 0, info.size, 0, Math.PI * 2);
        ctx.fillStyle = canPlace
            ? "rgba(100, 255, 100, 0.2)"
            : "rgba(255, 100, 100, 0.2)";
        ctx.fill();

        // Draw polygon outline
        ctx.beginPath();
        for (let i = 0; i < currentMode; i++) {
            const angle = (i * 2 * Math.PI) / currentMode;
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
        ctx.fillStyle = canPlace ? info.color + "80" : "#FF000080"; // Add 50% transparency
        ctx.fill();

        ctx.strokeStyle = canPlace ? "white" : "red";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw number in center of preview
        ctx.fillStyle = "white";
        ctx.font = "14px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(currentMode.toString(), 0, 0);

        ctx.restore();
    }
}

// Game render function
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw placement preview
    drawPlacementPreview();

    // Draw all players' polygons
    for (const pid in players) {
        const player = players[pid];
        if (player && player.polygons) {
            for (const polygon of player.polygons) {
                const isSelected = polygon === selectedPolygon;
                const isOwnedByMe = pid === playerId;
                drawPolygon(polygon, isSelected, isOwnedByMe);
            }
        }
    }

    // Draw enemy polygons
    for (const enemy of enemies) {
        drawPolygon(enemy, false, false, true);
    }
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

    // Rotate enemies
    for (const enemy of enemies) {
        enemy.rotation = (enemy.rotation || 0) + 0.01;

        // Simple position interpolation for smoother movement
        if (enemy.targetX !== null && enemy.targetY !== null) {
            const dx = enemy.targetX - enemy.x;
            const dy = enemy.targetY - enemy.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 5) {
                const info = polygonInfo[enemy.sides];
                const speed = info ? info.speed * 0.5 : 0.75; // Slower than player
                enemy.x += (dx / distance) * speed;
                enemy.y += (dy / distance) * speed;
            }
        }
    }

    render();
    requestAnimationFrame(gameLoop);
}

// Handle window resize
window.addEventListener("resize", () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

// Start everything
updateModeDisplay();
gameLoop();
