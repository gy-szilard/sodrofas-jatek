// ===== Canvas =====
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const rows = 15;
const cols = 20;
const cellSize = 47.5;
canvas.width = 950;
canvas.height = 680;

// Karakter és NPC fizikai hitbox mérete
const CHAR_SIZE = 32;
// Férfi karakter finomhangolt méret-szorzója (hogy arányos maradjon, de ne érjen a falhoz)
const MALE_SCALE = 0.85;

// ===== Képek Betöltése =====
const maleImg = new Image();
maleImg.src = "media/pictures/male.png";

const femaleImg = new Image();
femaleImg.src = "media/pictures/female.png";

const enemyImg = new Image();
enemyImg.src = "media/pictures/enemy.png";

const rollingPinImg = new Image();
rollingPinImg.src = "media/pictures/rolling_pin.png";

// ===== Játék állapot =====
let maze = [];
let px = 0, py = 0, speed = 5, facing = "right";
let hp = 100, score = 0, gameOver = false;
let attackTimer = 0, hitCooldown = 0;
let w = false, a = false, s = false, d = false;
let female = false;
let choosingCharacter = true;

// ===== Sebzés növekedési mechanika =====
let enemyDamage = 2; // Alap sebzés

// ===== Szívek (Gyógyítás) állapot =====
let hearts = []; 
let killsSinceLastHeart = 0;
const KILLS_REQUIRED_FOR_HEART = 7;
const HEART_HEAL_AMOUNT = 15; 
const HEART_SIZE = 25;

// ===== NPC (Ellenség) =====
class NPC {
    constructor(x, y) {
        this.x = x; this.y = y; this.size = CHAR_SIZE;
        this.dx = 0; this.dy = 0;
        this.facing = "right";
        this.setRandomDirection();
    }
    setRandomDirection() {
        const dir = Math.floor(Math.random() * 4);
        this.dx = 0; this.dy = 0;
        if (dir === 0) { this.dy = -2; this.facing = "up"; }
        if (dir === 1) { this.dy = 2; this.facing = "down"; }
        if (dir === 2) { this.dx = -2; this.facing = "left"; }
        if (dir === 3) { this.dx = 2; this.facing = "right"; }
    }
    move() {
        if (!isColliding(this.x + this.dx, this.y + this.dy)) {
            this.x += this.dx; this.y += this.dy;
        } else this.setRandomDirection();
    }
}
let npcs = [];

// ===== Labirintus =====
function generateMaze() {
    maze = Array.from({ length: rows }, () => Array(cols).fill(true));
    function dfs(r, c) {
        maze[r][c] = false;
        const dr = [-2, 2, 0, 0], dc = [0, 0, -2, 2];
        const dirs = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
        dirs.forEach(d => {
            const nr = r + dr[d], nc = c + dc[d];
            if (nr > 0 && nr < rows && nc > 0 && nc < cols && maze[nr][nc]) {
                maze[r + dr[d] / 2][c + dc[d] / 2] = false;
                dfs(nr, nc);
            }
        });
    }
    dfs(1, 1);
}

// ===== Spawn =====
function placePlayer() {
    const offset = (cellSize - CHAR_SIZE) / 2;
    px = cellSize + offset; 
    py = cellSize + offset;
    npcs = [];
    for (let i = 0; i < 8; i++) {
        let nx, ny, tries = 0;
        do {
            nx = Math.floor(Math.random() * cols) * cellSize + offset;
            ny = Math.floor(Math.random() * rows) * cellSize + offset;
            tries++; if (tries > 100) break;
        } while (
            maze[Math.floor(ny / cellSize)][Math.floor(nx / cellSize)] ||
            (Math.abs(nx - px) < cellSize * 2 && Math.abs(ny - py) < cellSize * 2)
        );
        npcs.push(new NPC(nx, ny));
    }
}

// ===== Kollízió =====
function isColliding(x, y) {
    const cellX = Math.floor(x / cellSize);
    const cellY = Math.floor(y / cellSize);
    const cellX2 = Math.floor((x + CHAR_SIZE) / cellSize);
    const cellY2 = Math.floor((y + CHAR_SIZE) / cellSize);
    if (cellX < 0 || cellY < 0 || cellX2 >= cols || cellY2 >= rows) return true;
    for (let i = cellY; i <= cellY2; i++)
        for (let j = cellX; j <= cellX2; j++)
            if (maze[i][j]) return true;
    return false;
}

// ===== Mozgás =====
function movePlayer() {
    let dx = 0, dy = 0;
    if (w) dy -= 1;
    if (s) dy += 1;
    if (a) dx -= 1;
    if (d) dx += 1;

    if (dx === 0 && dy === 0) return;

    const length = Math.sqrt(dx * dx + dy * dy);
    dx = (dx / length) * speed;
    dy = (dy / length) * speed;

    if (Math.abs(dx) > Math.abs(dy)) {
        facing = dx > 0 ? "right" : "left";
    } else {
        facing = dy > 0 ? "down" : "up";
    }

    const nx = px + dx;
    const ny = py + dy;

    if (!isColliding(nx, ny)) {
        px = nx; py = ny;
    }
}

function moveNPCs() { npcs.forEach(n => n.move()); }

// ===== Támadás =====
function getAttackRect() {
    if (attackTimer <= 0) return null;
    
    const pinLength = 48;
    const pinThick = 16;
    
    if (facing === "right") return { x: px + CHAR_SIZE, y: py + 8, w: pinLength, h: pinThick };
    if (facing === "left")  return { x: px - pinLength, y: py + 8, w: pinLength, h: pinThick };
    // Felfelé ütésnél kitoltuk a pozíciót, hogy tisztán a fej FÖLÖTT legyen!
    if (facing === "up")    return { x: px + 8, y: py - pinLength - 6, w: pinThick, h: pinLength };
    return { x: px + 8, y: py + CHAR_SIZE, w: pinThick, h: pinLength }; // down
}

function attackNPCs() {
    const atk = getAttackRect();
    if (!atk) return;
    npcs.forEach(npc => {
        if (atk.x < npc.x + CHAR_SIZE &&
            atk.x + atk.w > npc.x &&
            atk.y < npc.y + CHAR_SIZE &&
            atk.y + atk.h > npc.y) {

            const offset = (cellSize - CHAR_SIZE) / 2;
            let nx, ny;
            do {
                nx = Math.floor(Math.random() * cols) * cellSize + offset;
                ny = Math.floor(Math.random() * rows) * cellSize + offset;
            } while (
                maze[Math.floor(ny / cellSize)][Math.floor(nx / cellSize)] ||
                (Math.abs(nx - px) < cellSize * 2 && Math.abs(ny - py) < cellSize * 2)
            );

            npc.x = nx; npc.y = ny;
            score++;

            enemyDamage = Math.min(15, 2 + Math.floor(score / 30));

            killsSinceLastHeart++;
            if (killsSinceLastHeart >= KILLS_REQUIRED_FOR_HEART) {
                if (hearts.length < 3) {
                    let hx, hy;
                    do {
                        hx = Math.floor(Math.random() * cols) * cellSize + (cellSize - HEART_SIZE) / 2;
                        hy = Math.floor(Math.random() * rows) * cellSize + (cellSize - HEART_SIZE) / 2;
                    } while (maze[Math.floor(hy / cellSize)][Math.floor(hx / cellSize)]);
                    
                    hearts.push({ x: hx, y: hy });
                }
                killsSinceLastHeart = 0;
            }
        }
    });
}

// ===== Sebzés =====
function checkHits() {
    if (hitCooldown > 0) hitCooldown--;
    for (let npc of npcs) {
        if (px + CHAR_SIZE > npc.x && px < npc.x + CHAR_SIZE && py + CHAR_SIZE > npc.y && py < npc.y + CHAR_SIZE) {
            if (hitCooldown === 0) { 
                hp -= enemyDamage;
                hitCooldown = 15; 
            }
        }
    }
    if (hp <= 0) gameOver = true; 
    if (attackTimer > 0) attackTimer--;
}

// ===== Szívek felszedése =====
function checkHeartPickup() {
    for (let i = hearts.length - 1; i >= 0; i--) {
        let h = hearts[i];
        if (px + CHAR_SIZE > h.x && px < h.x + HEART_SIZE &&
            py + CHAR_SIZE > h.y && py < h.y + HEART_SIZE) {
            
            let currentHeal = 15 + Math.floor(score / 45) * 5;
            currentHeal = Math.min(40, currentHeal);

            hp = Math.min(100, hp + currentHeal);
            hearts.splice(i, 1);
        }
    }
}

// ===== Képek kirajzolása arányos méretezéssel =====
function drawSprite(img, x, y, targetWidth, targetHeight, flipHorizontally = false, rotateAngle = 0) {
    ctx.save();
    
    if (!img.complete || img.naturalWidth === 0) {
        ctx.restore();
        return;
    }

    const aspectRatio = img.naturalWidth / img.naturalHeight;
    let renderWidth = targetWidth;
    let renderHeight = targetWidth / aspectRatio;

    let drawY = y - (renderHeight - targetHeight);

    ctx.translate(x + targetWidth / 2, drawY + renderHeight / 2);

    if (flipHorizontally) {
        ctx.scale(-1, 1);
    }
    if (rotateAngle !== 0) {
        ctx.rotate(rotateAngle);
    }

    ctx.drawImage(img, -renderWidth / 2, -renderHeight / 2, renderWidth, renderHeight);
    ctx.restore();
}

// Karakter és NPC rajzoló
function drawCharacter(x, y, isPlayer, femaleOption, currentFacing) {
    let img = isPlayer ? (femaleOption ? femaleImg : maleImg) : enemyImg;
    let flip = (currentFacing === "left");
    
    // Ha a férfi karakterről van szó, kicsit lecsökkentjük a rajzolt méretét (arányosan)
    let renderSize = (isPlayer && !femaleOption) ? CHAR_SIZE * MALE_SCALE : CHAR_SIZE;
    let drawOffset = (CHAR_SIZE - renderSize) / 2; // Középre igazítás

    drawSprite(img, x + drawOffset, y + drawOffset, renderSize, renderSize, flip);
}

// Sodrófa kirajzolása
function drawRollingPin(atkRect, currentFacing) {
    ctx.save();
    if (!rollingPinImg.complete || rollingPinImg.naturalWidth === 0) {
        ctx.restore();
        return;
    }

    const centerX = atkRect.x + atkRect.w / 2;
    const centerY = atkRect.y + atkRect.h / 2;

    ctx.translate(centerX, centerY);

    if (currentFacing === "up") {
        ctx.rotate(-Math.PI / 2);
    } else if (currentFacing === "down") {
        ctx.rotate(Math.PI / 2);
    } else if (currentFacing === "left") {
        ctx.scale(-1, 1);
    }

    if (currentFacing === "up" || currentFacing === "down") {
        ctx.drawImage(rollingPinImg, -atkRect.h / 2, -atkRect.w / 2, atkRect.h, atkRect.w);
    } else {
        ctx.drawImage(rollingPinImg, -atkRect.w / 2, -atkRect.h / 2, atkRect.w, atkRect.h);
    }

    ctx.restore();
}

// ===== Rajzolás =====
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (choosingCharacter) {
        ctx.fillStyle = "#eee";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const centerX = canvas.width / 2;
        const y = canvas.height / 2;
        drawCharacter(centerX - 80, y, true, false, "right");
        drawCharacter(centerX + 40, y, true, true, "right");
        return;
    }

    // Labirintus falak
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (maze[r][c]) {
                ctx.fillStyle = "black";
                ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
            }
        }
    }

    // Összes aktív szív kirajzolása
    hearts.forEach(h => {
        ctx.fillStyle = "red";
        ctx.beginPath();
        const topCurveHeight = HEART_SIZE * 0.3;
        ctx.moveTo(h.x + HEART_SIZE / 2, h.y + topCurveHeight);
        ctx.bezierCurveTo(h.x + HEART_SIZE / 2, h.y, h.x, h.y, h.x, h.y + topCurveHeight);
        ctx.bezierCurveTo(h.x, h.y + (HEART_SIZE + topCurveHeight) / 2, h.x + HEART_SIZE / 2, h.y + HEART_SIZE, h.x + HEART_SIZE / 2, h.y + HEART_SIZE);
        ctx.bezierCurveTo(h.x + HEART_SIZE / 2, h.y + HEART_SIZE, h.x + HEART_SIZE, h.y + (HEART_SIZE + topCurveHeight) / 2, h.x + HEART_SIZE, h.y + topCurveHeight);
        ctx.bezierCurveTo(h.x + HEART_SIZE, h.y, h.x + HEART_SIZE / 2, h.y, h.x + HEART_SIZE / 2, h.y + topCurveHeight);
        ctx.closePath();
        ctx.fill();
    });

    // Karakterek kirajzolása
    drawCharacter(px, py, true, female, facing);
    npcs.forEach(n => drawCharacter(n.x, n.y, false, false, n.facing));

    // Sodrófa (Támadás) Kirajzolása
    const atk = getAttackRect();
    if (atk) {
        drawRollingPin(atk, facing);
    }

    // HP sáv
    ctx.fillStyle = "gray";
    ctx.fillRect(10, 10, 200, 20);
    ctx.fillStyle = "limegreen";
    ctx.fillRect(10, 10, 2 * hp, 20);
    ctx.strokeRect(10, 10, 200, 20);

    // HP és pontszám
    ctx.font = "20px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "black";
    ctx.fillText("HP: " + hp, 10 + 200 / 2, 10 + 20 / 2);
    ctx.fillStyle = "goldenrod";
    ctx.fillText("Pont: " + score, 220 + 50, 10 + 20 / 2);

    ctx.font = "14px Arial";
    ctx.fillStyle = "darkred";
    ctx.fillText("Dmg: " + enemyDamage, 340, 10 + 20 / 2);

    // Game Over
    if (gameOver) {
        ctx.fillStyle = "red";
        ctx.font = "40px Arial";
        ctx.textAlign = "center";
        ctx.fillText("Game Over! Press Enter to restart", canvas.width / 2, canvas.height / 2);
    }
}

// ===== Update =====
function update() {
    if (!choosingCharacter) {
        if (!gameOver) {
            movePlayer();
            moveNPCs();
            checkHits();
            checkHeartPickup();
            attackNPCs();
        }
    }
    draw();
    requestAnimationFrame(update);
}

// ===== Teljes Játék Újraindítás =====
function resetWholeGame() {
    hp = 100;
    score = 0;
    enemyDamage = 2;
    gameOver = false;
    w = false; a = false; s = false; d = false;
    attackTimer = 0;
    hitCooldown = 0;
    hearts = []; 
    killsSinceLastHeart = 0;
    choosingCharacter = true; 
}

// ===== Input =====
document.addEventListener("keydown", e => {
    if (e.key === "r" || e.key === "R") {
        resetWholeGame();
        return;
    }

    if ((e.key === "q" || e.key === "Q") && !choosingCharacter && !gameOver) {
        const offset = (cellSize - CHAR_SIZE) / 2;
        px = cellSize + offset; 
        py = cellSize + offset;
        facing = "right";
        return;
    }

    if (choosingCharacter) return;

    if (gameOver && e.key === "Enter") {
        hp = 100;
        score = 0;
        enemyDamage = 2;
        const offset = (cellSize - CHAR_SIZE) / 2;
        px = cellSize + offset; 
        py = cellSize + offset;
        facing = "right";
        gameOver = false;
        hearts = []; 
        killsSinceLastHeart = 0;
        generateMaze();
        placePlayer();
    }

    if (!gameOver) {
        if (e.key === "w") w = true;
        if (e.key === "s") s = true;
        if (e.key === "a") a = true;
        if (e.key === "d") d = true;
        if (e.key === " ") attackTimer = 10;
    }
});

document.addEventListener("keyup", e => {
    if (e.key === "w") w = false;
    if (e.key === "s") s = false;
    if (e.key === "a") a = false;
    if (e.key === "d") d = false;
});

canvas.addEventListener("mousedown", e => {
    if (choosingCharacter) {
        const centerX = canvas.width / 2;
        if (e.offsetX > centerX - 80 && e.offsetX < centerX - 40) {
            female = false; choosingCharacter = false; generateMaze(); placePlayer();
        }
        if (e.offsetX > centerX + 40 && e.offsetX < centerX + 80) {
            female = true; choosingCharacter = false; generateMaze(); placePlayer();
        }
    } else {
        attackTimer = 10;
    }
});

update();