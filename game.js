// ===== Canvas Setup =====
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

const rows = isTouchDevice ? 9 : 15;
const cols = isTouchDevice ? 15 : 20;
const cellSize = isTouchDevice ? 60 : 47.5;

canvas.width = cols * cellSize;
canvas.height = rows * cellSize;

const CHAR_SIZE = isTouchDevice ? 38 : 32;
const MALE_SCALE = 0.85;

// ===== Képek Betöltése =====
const maleImg = new Image(); maleImg.src = "media/pictures/male.png";
const femaleImg = new Image(); femaleImg.src = "media/pictures/female.png";
const enemyImg = new Image(); enemyImg.src = "media/pictures/enemy.png";
const rollingPinImg = new Image(); rollingPinImg.src = "media/pictures/rolling_pin.png";
const shovelImg = new Image(); shovelImg.src = "media/pictures/shovel.png";

// ===== Játék állapot =====
let maze = [];
let px = 0, py = 0, speed = isTouchDevice ? 4.5 : 5, facing = "right";
let hp = 100, score = 0, gameOver = false;
let attackTimer = 0, hitCooldown = 0;
let activeAttackWeapon = "pin"; 
let w = false, a = false, s = false, d = false;
let female = false;
let choosingCharacter = true;

// ===== Ásó és fegyver váltás állapota =====
let currentWeapon = "pin"; 
let inventoryShovels = 0;
let killsSinceLastShovel = 0;
let droppedShovels = []; // { x, y }
let pendingShovels = 0; 
let removedWalls = []; // { r, c, timer }

// ===== Sebzés növekedési mechanika =====
let enemyDamage = 2;

// ===== Szívek & Tárgyak mérete =====
let hearts = []; 
let killsSinceLastHeart = 0;
const KILLS_REQUIRED_FOR_HEART = 7;
const HEART_SIZE = isTouchDevice ? 30 : 25;
const SHOVEL_ITEM_SIZE = isTouchDevice ? 60 : 70; 

// ===== NPC (Ellenség) =====
class NPC {
    constructor(x, y) {
        this.x = x; this.y = y; this.size = CHAR_SIZE;
        this.dx = 0; this.dy = 0;
        this.facing = "right";
        this.frozenTimer = 0;
        this.setRandomDirection();
    }
    setRandomDirection() {
        const dir = Math.floor(Math.random() * 4);
        const moveStep = isTouchDevice ? 2 : 2;
        this.dx = 0; this.dy = 0;
        if (dir === 0) { this.dy = -moveStep; this.facing = "up"; }
        if (dir === 1) { this.dy = moveStep; this.facing = "down"; }
        if (dir === 2) { this.dx = -moveStep; this.facing = "left"; }
        if (dir === 3) { this.dx = moveStep; this.facing = "right"; }
    }
    move() {
        if (this.frozenTimer > 0) {
            this.frozenTimer--;
            return;
        }
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
    const npcCount = isTouchDevice ? 5 : 8;
    for (let i = 0; i < npcCount; i++) {
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

function triggerAttack() {
    if (attackTimer <= 2) {
        attackTimer = 12;
        activeAttackWeapon = currentWeapon;
        if (currentWeapon === "shovel" && inventoryShovels > 0) {
            useShovel();
        }
    }
}

function switchWeapon() {
    if (currentWeapon === "pin") {
        if (inventoryShovels > 0) {
            currentWeapon = "shovel";
        }
    } else {
        currentWeapon = "pin";
    }
}

function spawnShovelOnGround() {
    let sR, sC, sTries = 0;
    do {
        sR = Math.floor(Math.random() * rows);
        sC = Math.floor(Math.random() * cols);
        sTries++; if (sTries > 100) break;
    } while (maze[sR][sC]);
    
    let sx = sC * cellSize + (cellSize - SHOVEL_ITEM_SIZE) / 2;
    let sy = sR * cellSize + (cellSize - SHOVEL_ITEM_SIZE) / 2;

    droppedShovels.push({ x: sx, y: sy });
}

function checkPendingShovels() {
    while (pendingShovels > 0 && (inventoryShovels + droppedShovels.length) < 3) {
        spawnShovelOnGround();
        pendingShovels--;
    }
}

function useShovel() {
    if (inventoryShovels <= 0) return;

    let targetR = Math.floor((py + CHAR_SIZE / 2) / cellSize);
    let targetC = Math.floor((px + CHAR_SIZE / 2) / cellSize);

    if (facing === "up") targetR--;
    else if (facing === "down") targetR++;
    else if (facing === "left") targetC--;
    else if (facing === "right") targetC++;

    let shovelUsed = false;

    if (targetR > 0 && targetR < rows - 1 && targetC > 0 && targetC < cols - 1) {
        if (maze[targetR][targetC]) {
            maze[targetR][targetC] = false;
            removedWalls.push({ r: targetR, c: targetC, timer: 1080 }); 
            shovelUsed = true;
        }
    }

    if (!shovelUsed) {
        const atk = getAttackRect();
        if (atk) {
            npcs.forEach(npc => {
                if (atk.x < npc.x + CHAR_SIZE &&
                    atk.x + atk.w > npc.x &&
                    atk.y < npc.y + CHAR_SIZE &&
                    atk.y + atk.h > npc.y) {
                    npc.frozenTimer = 600; 
                    shovelUsed = true;
                }
            });
        }
    }

    if (shovelUsed) {
        inventoryShovels--;
        if (inventoryShovels <= 0) {
            currentWeapon = "pin";
        }
        checkPendingShovels();
    }
}

function updateRemovedWalls() {
    for (let i = removedWalls.length - 1; i >= 0; i--) {
        let wall = removedWalls[i];
        wall.timer--;

        if (wall.timer <= 0) {
            maze[wall.r][wall.c] = true;
            
            const pR1 = Math.floor(py / cellSize);
            const pR2 = Math.floor((py + CHAR_SIZE) / cellSize);
            const pC1 = Math.floor(px / cellSize);
            const pC2 = Math.floor((px + CHAR_SIZE) / cellSize);

            if ((pR1 <= wall.r && wall.r <= pR2) && (pC1 <= wall.c && wall.c <= pC2)) {
                respawnPlayer();
                hp = Math.floor(hp * 0.75);
            }

            removedWalls.splice(i, 1);
        }
    }
}

function getAttackRect() {
    if (attackTimer <= 0) return null;
    
    const isShovelAttack = (activeAttackWeapon === "shovel");
    const pinLength = isShovelAttack ? (isTouchDevice ? 56 : 48) : (isTouchDevice ? 68 : 58);
    // Sodrófa vékonyítva (16 / 12)
    const pinThick  = isShovelAttack ? (isTouchDevice ? 20 : 16) : (isTouchDevice ? 16 : 12);

    if (facing === "right") return { x: px + CHAR_SIZE, y: py + (CHAR_SIZE - pinThick) / 2, w: pinLength, h: pinThick };
    if (facing === "left")  return { x: px - pinLength, y: py + (CHAR_SIZE - pinThick) / 2, w: pinLength, h: pinThick };
    if (facing === "up")    return { x: px + (CHAR_SIZE - pinThick) / 2, y: py - pinLength, w: pinThick, h: pinLength };
    return { x: px + (CHAR_SIZE - pinThick) / 2, y: py + CHAR_SIZE, w: pinThick, h: pinLength };
}

function attackNPCs() {
    if (activeAttackWeapon !== "pin") return; 

    const atk = getAttackRect();
    if (!atk) return;
    npcs.forEach(npc => {
        if (atk.x < npc.x + CHAR_SIZE &&
            atk.x + atk.w > npc.x &&
            atk.y < npc.y + CHAR_SIZE &&
            atk.y + atk.h > npc.y) {

            const offset = (cellSize - CHAR_SIZE) / 2;
            let nx, ny, tries = 0;
            do {
                nx = Math.floor(Math.random() * cols) * cellSize + offset;
                ny = Math.floor(Math.random() * rows) * cellSize + offset;
                tries++; if (tries > 100) break;
            } while (
                maze[Math.floor(ny / cellSize)][Math.floor(nx / cellSize)] ||
                (Math.abs(nx - px) < cellSize * 2 && Math.abs(ny - py) < cellSize * 2)
            );

            npc.x = nx; npc.y = ny;
            npc.frozenTimer = 0; 
            score++;
            enemyDamage = Math.min(15, 2 + Math.floor(score / 30));

            killsSinceLastShovel++;
            if (killsSinceLastShovel >= 15) {
                if ((inventoryShovels + droppedShovels.length) < 3) {
                    spawnShovelOnGround();
                } else {
                    pendingShovels++;
                }
                killsSinceLastShovel = 0;
            }

            killsSinceLastHeart++;
            if (killsSinceLastHeart >= KILLS_REQUIRED_FOR_HEART) {
                if (hearts.length < 3) {
                    let hx, hy, hTries = 0;
                    do {
                        hx = Math.floor(Math.random() * cols) * cellSize + (cellSize - HEART_SIZE) / 2;
                        hy = Math.floor(Math.random() * rows) * cellSize + (cellSize - HEART_SIZE) / 2;
                        hTries++; if (hTries > 100) break;
                    } while (maze[Math.floor(hy / cellSize)][Math.floor(hx / cellSize)]);
                    hearts.push({ x: hx, y: hy });
                }
                killsSinceLastHeart = 0;
            }
        }
    });
}

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

function checkPickups() {
    for (let i = hearts.length - 1; i >= 0; i--) {
        let h = hearts[i];
        if (px + CHAR_SIZE > h.x && px < h.x + HEART_SIZE &&
            py + CHAR_SIZE > h.y && py < h.y + HEART_SIZE) {
            let currentHeal = Math.min(40, 15 + Math.floor(score / 45) * 5);
            hp = Math.min(100, hp + currentHeal);
            hearts.splice(i, 1);
        }
    }

    for (let i = droppedShovels.length - 1; i >= 0; i--) {
        let s = droppedShovels[i];
        if (px + CHAR_SIZE > s.x && px < s.x + SHOVEL_ITEM_SIZE &&
            py + CHAR_SIZE > s.y && py < s.y + SHOVEL_ITEM_SIZE) {
            if (inventoryShovels < 3) {
                inventoryShovels++;
                droppedShovels.splice(i, 1);
                checkPendingShovels();
            }
        }
    }
}

// ===== Rajzoló funkciók =====
function drawSprite(img, x, y, targetWidth, targetHeight, flipHorizontally = false, rotateAngle = 0) {
    ctx.save();
    if (!img.complete || img.naturalWidth === 0) { ctx.restore(); return; }

    const aspectRatio = img.naturalWidth / img.naturalHeight;
    let renderW = targetWidth;
    let renderH = targetWidth / aspectRatio;

    const centerX = x + targetWidth / 2;
    const centerY = y + targetHeight / 2;

    ctx.translate(centerX, centerY);
    if (flipHorizontally) ctx.scale(-1, 1);
    if (rotateAngle !== 0) ctx.rotate(rotateAngle);

    ctx.drawImage(img, -renderW / 2, -renderH / 2, renderW, renderH);
    ctx.restore();
}

function drawCharacter(x, y, isPlayer, femaleOption, currentFacing, frozen = false) {
    let img = isPlayer ? (femaleOption ? femaleImg : maleImg) : enemyImg;
    let flip = (currentFacing === "left");
    let renderSize = (isPlayer && !femaleOption) ? CHAR_SIZE * MALE_SCALE : CHAR_SIZE;
    let drawOffset = (CHAR_SIZE - renderSize) / 2;

    if (frozen) {
        ctx.save();
        ctx.filter = "brightness(0.7) hue-rotate(180deg)";
    }

    drawSprite(img, x + drawOffset, y + drawOffset, renderSize, renderSize, flip);

    if (frozen) {
        ctx.restore();
    }
}

function drawWeapon(atkRect, currentFacing) {
    ctx.save();
    const img = (activeAttackWeapon === "shovel") ? shovelImg : rollingPinImg;

    if (!img.complete || img.naturalWidth === 0) { 
        ctx.restore(); 
        return; 
    }

    const centerX = atkRect.x + atkRect.w / 2;
    const centerY = atkRect.y + atkRect.h / 2;
    ctx.translate(centerX, centerY);

    if (currentFacing === "up") ctx.rotate(-Math.PI / 2);
    else if (currentFacing === "down") ctx.rotate(Math.PI / 2);
    else if (currentFacing === "left") ctx.scale(-1, 1);

    if (currentFacing === "up" || currentFacing === "down") {
        ctx.drawImage(img, -atkRect.h / 2, -atkRect.w / 2, atkRect.h, atkRect.w);
    } else {
        ctx.drawImage(img, -atkRect.w / 2, -atkRect.h / 2, atkRect.w, atkRect.h);
    }
    
    ctx.restore();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (choosingCharacter) {
        ctx.fillStyle = "#eee";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const centerX = canvas.width / 2;
        const y = canvas.height / 2;
        
        ctx.fillStyle = "#333";
        ctx.font = "bold 24px Arial";
        ctx.textAlign = "center";
        ctx.fillText("Válassz karaktert!", centerX, y - 60);

        drawCharacter(centerX - 80, y, true, false, "right");
        drawCharacter(centerX + 30, y, true, true, "right");
        return;
    }

    // Labirintus
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (maze[r][c]) {
                ctx.fillStyle = "black";
                ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
            }
        }
    }

    // Villogó falak
    removedWalls.forEach(wall => {
        if (wall.timer < 300) {
            if (Math.floor(wall.timer / 15) % 2 === 0) {
                ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
                ctx.fillRect(wall.c * cellSize, wall.r * cellSize, cellSize, cellSize);
            }
        }
    });

    // Szívek
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

    // Földön lévő ásók
    droppedShovels.forEach(s => {
        drawSprite(shovelImg, s.x, s.y, SHOVEL_ITEM_SIZE, SHOVEL_ITEM_SIZE, false, 0);
    });

    // Karakterek
    drawCharacter(px, py, true, female, facing);
    npcs.forEach(n => drawCharacter(n.x, n.y, false, false, n.facing, n.frozenTimer > 0));

    // Fegyver kirajzolása
    const atk = getAttackRect();
    if (atk) drawWeapon(atk, facing);

    // HP sáv & Stats
    const barWidth = isTouchDevice ? 160 : 200;
    const barHeight = 20;
    ctx.fillStyle = "gray"; ctx.fillRect(10, 10, barWidth, barHeight);
    ctx.fillStyle = "limegreen"; ctx.fillRect(10, 10, Math.max(0, (barWidth / 100) * hp), barHeight);
    ctx.strokeRect(10, 10, barWidth, barHeight);

    ctx.font = isTouchDevice ? "14px Arial" : "18px Arial"; 
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillStyle = "black"; ctx.fillText("HP: " + hp, 15, 10 + barHeight / 2);
    ctx.fillStyle = "goldenrod"; ctx.fillText("Pont: " + score, 10 + barWidth + 15, 10 + barHeight / 2);

    // Fegyver HUD kijelzés
    const weaponX = 10 + barWidth + (isTouchDevice ? 85 : 110);
    const weaponText = (currentWeapon === "pin") ? "Sodrófa" : `Ásó (${inventoryShovels})`;
    ctx.fillStyle = "cyan";
    ctx.fillText(weaponText, weaponX, 10 + barHeight / 2);

    // Game Over
    if (gameOver) {
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "red";
        ctx.font = isTouchDevice ? "bold 30px Arial" : "bold 36px Arial";
        ctx.textAlign = "center";
        ctx.fillText("Game Over!", canvas.width / 2, canvas.height / 2 - 20);
        ctx.fillStyle = "white";
        ctx.font = isTouchDevice ? "17px Arial" : "20px Arial";
        ctx.fillText("Koppints a képernyőre vagy nyomj Enter-t az újrakezdéshez", canvas.width / 2, canvas.height / 2 + 20);
    }
}

function fullResetToCharacterSelect() {
    hp = 100; score = 0; enemyDamage = 2;
    facing = "right"; gameOver = false;
    hearts = []; killsSinceLastHeart = 0;
    inventoryShovels = 0; killsSinceLastShovel = 0; droppedShovels = []; pendingShovels = 0; removedWalls = [];
    currentWeapon = "pin"; activeAttackWeapon = "pin";
    choosingCharacter = true;
    w = false; a = false; s = false; d = false;
    attackTimer = 0;
}

function restartGame() {
    hp = 100; score = 0; enemyDamage = 2;
    const offset = (cellSize - CHAR_SIZE) / 2;
    px = cellSize + offset; py = cellSize + offset;
    facing = "right"; gameOver = false;
    hearts = []; killsSinceLastHeart = 0;
    inventoryShovels = 0; killsSinceLastShovel = 0; droppedShovels = []; pendingShovels = 0; removedWalls = [];
    currentWeapon = "pin"; activeAttackWeapon = "pin";
    attackTimer = 0;
    generateMaze(); placePlayer();
}

function respawnPlayer() {
    const offset = (cellSize - CHAR_SIZE) / 2;
    px = cellSize + offset;
    py = cellSize + offset;
}

function update() {
    if (!choosingCharacter && !gameOver) {
        movePlayer();
        moveNPCs();
        checkHits();
        checkPickups();
        attackNPCs();
        updateRemovedWalls();
    }
    draw();
    requestAnimationFrame(update);
}

// ===== INPUT HANDLING =====
document.addEventListener("keydown", e => {
    if (isTouchDevice) return;

    if (choosingCharacter) return;
    if (gameOver && e.key === "Enter") restartGame();
    if (!gameOver) {
        if (e.key === "w" || e.key === "W") w = true;
        if (e.key === "s" || e.key === "S") s = true;
        if (e.key === "a" || e.key === "A") a = true;
        if (e.key === "d" || e.key === "D") d = true;
        if (e.key === "e" || e.key === "E") switchWeapon();
        if (e.key === " ") triggerAttack();
        if (e.key === "q" || e.key === "Q") respawnPlayer();
        if (e.key === "r" || e.key === "R") fullResetToCharacterSelect();
    }
});

document.addEventListener("keyup", e => {
    if (isTouchDevice) return;

    if (e.key === "w" || e.key === "W") w = false;
    if (e.key === "s" || e.key === "S") s = false;
    if (e.key === "a" || e.key === "A") a = false;
    if (e.key === "d" || e.key === "D") d = false;
});

canvas.addEventListener("pointerdown", e => {
    if (isTouchDevice && !choosingCharacter && !gameOver) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const clickX = (e.clientX - rect.left) * scaleX;

    if (choosingCharacter) {
        const centerX = canvas.width / 2;
        if (clickX > centerX - 100 && clickX < centerX - 10) {
            female = false; choosingCharacter = false; generateMaze(); placePlayer();
        } else if (clickX > centerX + 10 && clickX < centerX + 100) {
            female = true; choosingCharacter = false; generateMaze(); placePlayer();
        }
    } else if (gameOver) {
        restartGame();
    } else if (!isTouchDevice && e.button === 0) {
        triggerAttack();
    }
});

function setupTouchButton(id, onPress, onRelease) {
    const btn = document.getElementById(id);
    if (!btn) return;

    const startHandler = (e) => {
        if (e.cancelable) e.preventDefault();
        onPress();
    };

    const endHandler = (e) => {
        if (e.cancelable) e.preventDefault();
        if (onRelease) onRelease();
    };

    btn.addEventListener("touchstart", startHandler, { passive: false });
    btn.addEventListener("touchend", endHandler, { passive: false });
    btn.addEventListener("touchcancel", endHandler, { passive: false });

    btn.addEventListener("pointerdown", startHandler);
    btn.addEventListener("pointerup", endHandler);
    btn.addEventListener("pointerleave", endHandler);
}

setupTouchButton("btn-up",    () => w = true,  () => w = false);
setupTouchButton("btn-down",  () => s = true,  () => s = false);
setupTouchButton("btn-left",  () => a = true,  () => a = false);
setupTouchButton("btn-right", () => d = true,  () => d = false);
setupTouchButton("btn-attack",() => { if(!gameOver && !choosingCharacter) triggerAttack(); });
setupTouchButton("btn-spawn", () => { if(!gameOver && !choosingCharacter) respawnPlayer(); });
setupTouchButton("btn-reset", () => { fullResetToCharacterSelect(); });
setupTouchButton("btn-weapon",() => { if(!gameOver && !choosingCharacter) switchWeapon(); });

update();
