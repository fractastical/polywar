
// Automation system for polygon creation
class AutomationSystem {
    constructor(game) {
        this.sequence = [];
        this.currentIndex = 0;
        this.lastX = null;
        this.lastY = null;
        this.game = game;
    }

    parseSequence(str) {
        // Parse sequence like "3p,3c,4c,4p,5p,5c,5c"
        this.sequence = str.split(',').map(cmd => ({
            sides: parseInt(cmd),
            mode: cmd.endsWith('p') ? 'producer' : 'combat'
        }));
        this.currentIndex = 0;
        this.lastX = 500;  // Start in center
        this.lastY = 300;
    }

    findValidPosition() {
        const radius = 150;  // Same as placement radius in main.js
        let attempts = 0;
        const maxAttempts = 20;

        while (attempts < maxAttempts) {
            // Random position within radius of last placement
            const angle = Math.random() * 2 * Math.PI;
            const distance = Math.random() * radius;
            const x = this.lastX + Math.cos(angle) * distance;
            const y = this.lastY + Math.sin(angle) * distance;

            // Check if position is valid (you may want to add more validation)
            if (x > 0 && x < window.innerWidth && y > 0 && y < window.innerHeight) {
                return { x, y };
            }

            attempts++;
        }

        return null;
    }

    executeNext() {
        if (this.currentIndex >= this.sequence.length) {
            console.log("Automation sequence completed");
            return false;
        }

        const action = this.sequence[this.currentIndex];
        const position = this.findValidPosition();

        if (position) {
            const cost = polygonInfo[action.sides].cost;
            if (resources >= cost) {
                socket.emit('placePolygon', {
                    x: position.x,
                    y: position.y,
                    sides: action.sides,
                    size: polygonInfo[action.sides].size,
                    cost: cost,
                    isProducer: action.mode === 'producer'
                });

                this.lastX = position.x;
                this.lastY = position.y;
                this.currentIndex++;
                return true;
            }
        }

        return false;
    }
}
