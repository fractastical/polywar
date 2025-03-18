        // Canvas setup
        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        
        // Game state
        let resources = 100;
        let polygons = [];
        let enemies = [];
        let selectedPolygon = null;
        let currentMode = null;
        let mouseX = 0;
        let mouseY = 0;
        
        // Simple type definitions to avoid errors
        const polygonInfo = {
            3: { name: "Triangle", cost: 10, size: 20, color: "#FF5733", speed: 2.0 },
            4: { name: "Square", cost: 15, size: 25, color: "#33FF57", speed: 1.8 },
            5: { name: "Pentagon", cost: 20, size: 30, color: "#3357FF", speed: 1.6 },
            6: { name: "Hexagon", cost: 25, size: 35, color: "#F033FF", speed: 1.4 },
            7: { name: "Heptagon", cost: 30, size: 40, color: "#FF33A1", speed: 1.2 },
            8: { name: "Octagon", cost: 35, size: 45, color: "#33FFF6", speed: 1.0 },
            9: { name: "Nonagon", cost: 40, size: 50, color: "#BFFF33", speed: 0.8 }
        };
        
        // Track mouse movement
        canvas.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        });
        
        // Handle keyboard input
        window.addEventListener('keydown', (e) => {
            // Number keys 3-9 select polygon with that many sides
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
                        resources -= cost;
                        
                        const newPolygon = {
                            x: selectedPolygon.x + (Math.random() * 40 - 20),
                            y: selectedPolygon.y + (Math.random() * 40 - 20),
                            sides: selectedPolygon.sides,
                            size: selectedPolygon.size,
                            color: selectedPolygon.color,
                            rotation: 0,
                            targetX: null,
                            targetY: null
                        };
                        
                        polygons.push(newPolygon);
                        updateDisplay();
                    }
                }
            }
            
            // Escape cancels placement
            if (e.key === 'Escape') {
                currentMode = null;
                updateModeDisplay();
            }
        });
        
        // Handle mouse clicks
        canvas.addEventListener('click', (e) => {
            if (currentMode !== null) {
                const cost = polygonInfo[currentMode].cost;
                if (resources >= cost) {
                    const info = polygonInfo[currentMode];
                    
                    // Check if the placement location overlaps with existing polygons
                    let canPlace = true;
                    for (const polygon of polygons) {
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
                        resources -= cost;
                        
                        const newPolygon = {
                            x: e.clientX,
                            y: e.clientY,
                            sides: currentMode,
                            size: info.size,
                            color: info.color,
                            rotation: 0,
                            targetX: null,
                            targetY: null
                        };
                        
                        polygons.push(newPolygon);
                        selectedPolygon = newPolygon;
                        updateDisplay();
                    }
                }
            } else {
                // Select polygon
                selectedPolygon = null;
                for (let i = polygons.length - 1; i >= 0; i--) {
                    const polygon = polygons[i];
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
        });
        
        // Handle right-click for movement
        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (selectedPolygon) {
                selectedPolygon.targetX = e.clientX;
                selectedPolygon.targetY = e.clientY;
            }
        });
        
        // Update display
        function updateDisplay() {
            document.getElementById('resources').textContent = resources;
            document.getElementById('polygonCount').textContent = polygons.length;
            document.getElementById('enemyCount').textContent = enemies.length;
        }
        
        // Update mode display
        function updateModeDisplay() {
            if (currentMode === null) {
                document.getElementById('currentMode').textContent = "None";
            } else {
                const info = polygonInfo[currentMode];
                document.getElementById('currentMode').textContent = 
                    `${info.name} (Cost: ${info.cost})`;
            }
        }
        
        // Create a random enemy
        function createEnemy() {
            const sides = Math.floor(Math.random() * 7) + 3; // 3 to 9 sides
            const info = polygonInfo[sides];
            
            enemies.push({
                x: canvas.width + 50,
                y: Math.random() * canvas.height,
                sides: sides,
                size: info.size,
                color: 'red',
                rotation: 0,
                targetX: Math.random() * canvas.width * 0.7,
                targetY: Math.random() * canvas.height
            });
            
            updateDisplay();
        }
        
        // Draw a polygon
        function drawPolygon(polygon, isSelected) {
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
            
            // Draw the polygon
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
            
            ctx.fillStyle = polygon.color;
            ctx.fill();
            
            ctx.strokeStyle = 'white';
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
        
        // Draw placement preview
        function drawPlacementPreview() {
            if (currentMode !== null) {
                const info = polygonInfo[currentMode];
                
                // Check if the placement location is valid
                let canPlace = true;
                for (const polygon of polygons) {
                    const distance = Math.sqrt(
                        Math.pow(polygon.x - mouseX, 2) + 
                        Math.pow(polygon.y - mouseY, 2)
                    );
                    
                    if (distance < polygon.size + info.size) {
                        canPlace = false;
                        break;
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
                ctx.translate(mouseX, mouseY);
                
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
        
        // Game update function
        function update() {
            // Move polygons toward their targets
            for (const polygon of polygons) {
                if (polygon.targetX !== null && polygon.targetY !== null) {
                    const dx = polygon.targetX - polygon.x;
                    const dy = polygon.targetY - polygon.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance > 5) {
                        const info = polygonInfo[polygon.sides];
                        polygon.x += (dx / distance) * info.speed;
                        polygon.y += (dy / distance) * info.speed;
                    } else {
                        polygon.targetX = null;
                        polygon.targetY = null;
                    }
                }
                
                // Rotate slowly
                polygon.rotation += 0.01;
            }
            
            // Move enemies
            for (let i = enemies.length - 1; i >= 0; i--) {
                const enemy = enemies[i];
                
                if (enemy.targetX !== null && enemy.targetY !== null) {
                    const dx = enemy.targetX - enemy.x;
                    const dy = enemy.targetY - enemy.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance > 5) {
                        const info = polygonInfo[enemy.sides];
                        enemy.x += (dx / distance) * info.speed * 0.5; // Slower than player
                        enemy.y += (dy / distance) * info.speed * 0.5;
                    } else {
                        // New random target
                        enemy.targetX = Math.random() * canvas.width * 0.7;
                        enemy.targetY = Math.random() * canvas.height;
                    }
                }
                
                // Rotate slowly
                enemy.rotation += 0.01;
                
                // Check for collisions with player polygons
                for (let j = polygons.length - 1; j >= 0; j--) {
                    const polygon = polygons[j];
                    
                    const dx = polygon.x - enemy.x;
                    const dy = polygon.y - enemy.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance < polygon.size + enemy.size) {
                        // Player polygon wins if it has exactly one more side
                        if (polygon.sides === enemy.sides + 1) {
                            enemies.splice(i, 1);
                            resources += Math.floor(polygonInfo[enemy.sides].cost / 2);
                            updateDisplay();
                            break;
                        }
                        // Enemy wins if it has exactly one more side
                        else if (enemy.sides === polygon.sides + 1) {
                            polygons.splice(j, 1);
                            if (selectedPolygon === polygon) {
                                selectedPolygon = null;
                            }
                            updateDisplay();
                            break;
                        }
                    }
                }
            }
            
            // Occasionally create a new enemy
            if (Math.random() < 0.005 && enemies.length < 10) {
                createEnemy();
            }
            
            // Generate resources over time
            if (Math.random() < 0.02) {
                resources++;
                updateDisplay();
            }
        }
        
        // Game render function
        function render() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Draw placement preview
            drawPlacementPreview();
            
            // Draw player polygons
            for (const polygon of polygons) {
                drawPolygon(polygon, polygon === selectedPolygon);
            }
            
            // Draw enemy polygons
            for (const enemy of enemies) {
                drawPolygon(enemy, false);
            }
        }
        
        // Game loop
        function gameLoop() {
            update();
            render();
            requestAnimationFrame(gameLoop);
        }
        
        // Create initial enemies
        for (let i = 0; i < 3; i++) {
            createEnemy();
        }
        
        // Initialize displays
        updateDisplay();
        updateModeDisplay();
        
        // Start the game
        gameLoop();
        
        // Handle window resize
        window.addEventListener('resize', () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        });
