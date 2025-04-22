const express = require('express');
const WebSocket = require('ws');
const { Engine, World, Bodies, Body, Resolver, Events } = require('matter-js');
Resolver._restingThresh = 0.1;

const CATEGORY_DEFAULT = 0x0001;
const CATEGORY_PLAYER  = 0x0002;
const CATEGORY_BALL    = 0x0004;
const CATEGORY_PLAYER_WALL = 0x0008;

const app = express();
app.use(express.static('public'));

const server = app.listen(3000, () => {
	console.log("Server is ready on port 3000!");
});

const wss = new WebSocket.WebSocketServer({ server });

function clamp(val, min, max) {
	return Math.max(min, Math.min(max, val));
}

var goalScored = {
    team: null,
    lastHitA: null,
    lastHitB: null
}

const maxScore = 3;
var winner = null;

const engine = Engine.create({ gravity: { x: 0, y: 0 }});
engine.positionIterations = 10;
engine.velocityIterations = 10;
engine.constraintIterations = 2;
engine.timing.timeScale = 1;
engine.world.gravity.y = 0;
engine.timing.correctDelta = true;
engine.velocityThreshold = 0;
engine.positionIterations = 10;

const bounds = { width: 1000, height: 625 };
const goalHeight = 125;
const wallThickness = 80;
const goalStartY = (bounds.height - goalHeight) / 2;
const goalEndY   = goalStartY + goalHeight;

const wallCollisionFilter = {
	category: CATEGORY_DEFAULT,
	mask: 0xFFFF
};

const leftWallTop = Bodies.rectangle(-wallThickness / 2, goalStartY / 2, wallThickness, goalStartY, {
	isStatic: true, friction: 0, restitution: 1, collisionFilter: wallCollisionFilter
});
const leftWallBottom = Bodies.rectangle(-wallThickness / 2, (goalEndY + bounds.height) / 2, wallThickness, bounds.height - goalEndY, {
	isStatic: true, friction: 0, restitution: 1, collisionFilter: wallCollisionFilter
});
const rightWallTop = Bodies.rectangle(bounds.width + wallThickness / 2, goalStartY / 2, wallThickness, goalStartY, {
	isStatic: true, friction: 0, restitution: 1, collisionFilter: wallCollisionFilter
});
const rightWallBottom = Bodies.rectangle(bounds.width + wallThickness / 2, (goalEndY + bounds.height) / 2, wallThickness, bounds.height - goalEndY, {
	isStatic: true, friction: 0, restitution: 1, collisionFilter: wallCollisionFilter
});
const topWall = Bodies.rectangle(bounds.width / 2, -wallThickness / 2, bounds.width + wallThickness, wallThickness, {
	isStatic: true, friction: 0, restitution: 1, collisionFilter: wallCollisionFilter
});
const bottomWall = Bodies.rectangle(bounds.width / 2, bounds.height + wallThickness / 2, bounds.width + wallThickness, wallThickness, {
	isStatic: true, friction: 0, restitution: 1, collisionFilter: wallCollisionFilter
});

const goalBlockCollisionFilter = {
	category: CATEGORY_PLAYER_WALL,
	mask: CATEGORY_PLAYER
};

const leftGoalBlocker = Bodies.rectangle(-wallThickness / 2, (goalStartY + goalEndY) / 2, wallThickness, goalHeight, {
	isStatic: true, collisionFilter: goalBlockCollisionFilter, render: { visible: false }
});
const rightGoalBlocker = Bodies.rectangle(bounds.width + wallThickness / 2, (goalStartY + goalEndY) / 2, wallThickness, goalHeight, {
	isStatic: true, collisionFilter: goalBlockCollisionFilter, render: { visible: false }
});

World.add(engine.world, [
	topWall, bottomWall,
	leftWallTop, leftWallBottom,
	rightWallTop, rightWallBottom,
	leftGoalBlocker, rightGoalBlocker
]);

const ballRadius = 10;
const ball = Bodies.circle(bounds.width * 0.5, bounds.height * 0.5, ballRadius, {
	inertia: Infinity,
	restitution: 0.8,
	friction: 0,
	frictionStatic: 0,
	frictionAir: 0.012,
	slop: 0,
	label: 'ball',
	sleepThreshold: Infinity,
	collisionFilter: {
		category: CATEGORY_BALL,
		mask: CATEGORY_DEFAULT | CATEGORY_PLAYER | CATEGORY_BALL
	}
});
Body.setMass(ball, 0.05);
Body.setVelocity(ball, { x: 0, y: 0 });
World.add(engine.world, ball);

const TEAM_A = "A";
const TEAM_B = "B";

const players = new Map();
let scoreA = 0;
let scoreB = 0;

const playerRadius = 15;
function createPlayerBody(x, y) {
	return Bodies.circle(x, y, playerRadius, {
		restitution: 0.75,
        frictionAir: 0.016,
		label: 'player',
		collisionFilter: {
			category: CATEGORY_PLAYER,
			mask: CATEGORY_DEFAULT | CATEGORY_BALL | CATEGORY_PLAYER | CATEGORY_PLAYER_WALL
		}
	});
}

function assignNumber(team) {
	const taken = new Set();
	for (const [, p] of players) {
		if (p.team === team && typeof p.number === "number") {
			taken.add(p.number);
		}
	}
	let num = 1;
	while (taken.has(num)) num++;
	return num;
}

function assignTeam() {
	let countA = 0, countB = 0;
	for (const [, pData] of players) {
		if (pData.team === TEAM_A) countA++;
		if (pData.team === TEAM_B) countB++;
	}
	if (countA < countB) return TEAM_A;
	if (countB < countA) return TEAM_B;
	return (Math.random() < 0.5) ? TEAM_A : TEAM_B;
}

function positionPlayer(targetPlayer) {
	if (!targetPlayer || !targetPlayer.body || !targetPlayer.team) return;

	const teamPlayers = [];
	for (const [, p] of players) {
		if (!p.body || p.team !== targetPlayer.team) continue;
		teamPlayers.push(p);
	}

	teamPlayers.sort((a, b) => a.number - b.number);

	const index = teamPlayers.indexOf(targetPlayer);
	if (index === -1) return;

	const pattern = [3, 5, 3];
	const spacingX = 120;
	const topMargin = 50;
	const bottomMargin = 50;
	const usableHeight = bounds.height - topMargin - bottomMargin;

	const quarter = bounds.width / 5;
    const xCenter = (targetPlayer.team === TEAM_A) ? bounds.width / 2 - quarter / 2 : bounds.width / 2 + quarter / 2;

	const facingRight = (targetPlayer.team === TEAM_A);

	let playerIndex = 0;
	let column = 0;

	while (playerIndex <= index) {
		const count = pattern[column % pattern.length];
		const spacingY = usableHeight / (count + 1);
		const x = xCenter + (facingRight ? -column * spacingX : column * spacingX);

		for (let i = 0; i < count && playerIndex <= index; i++, playerIndex++) {
			if (playerIndex === index) {
				let y;
                if (targetPlayer.team === TEAM_A) {
                    y = bounds.height - bottomMargin - (i + 1) * spacingY;
                } else {
                    y = topMargin + (i + 1) * spacingY;
                }

				Body.setPosition(targetPlayer.body, { x, y });
                Body.setVelocity(targetPlayer.body, { x: 0, y: 0 });
				return;
			}
		}

		column++;
	}
}

function positionAllPlayers() {
	for (const [, pData] of players) {
		positionPlayer(pData);
	}
}

function resetField() {
    Body.setVelocity(ball, { x: 0, y: 0 });
	Body.setPosition(ball, { x: (bounds.width / 2) - 1, y: bounds.height / 2 });

	positionAllPlayers();
}

function checkWinner() {
    if (winner != null) return;

    if (scoreA >= maxScore) {
        winner = 'A';
        setTimeout(function() {
            scoreA = 0;
            scoreB = 0;
            winner = null;
            resetField();
        }, 6000)
    } else if (scoreB >= maxScore) {
        winner = 'B';
        setTimeout(function() {
            scoreA = 0;
            scoreB = 0;
            winner = null;
            resetField();
        }, 6000)
    }
}

function checkGoal() {
    if (goalScored.team != null || winner != null) return;

	const bx = ball.position.x;
	const by = ball.position.y;

	if (bx < 0) {
		if (by >= goalStartY && by <= goalEndY) {
			scoreB++;
            goalScored.team = 'B';
			console.log("GOAL for Team B! Score:", scoreA, scoreB);
            setTimeout(function() {
                goalScored.team = null;
                checkWinner();
                if (winner == null) {
                    resetField();   
                }
            }, 5000);
            return;
        }
	}

	if (bx > bounds.width) {
		if (by >= goalStartY && by <= goalEndY) {
			scoreA++;
            goalScored.team = 'A';
			console.log("GOAL for Team A! Score:", scoreA, scoreB);
			setTimeout(function(){
                goalScored.team = null;
                checkWinner();
                if (winner == null) {
                    resetField();   
                }
            }, 5000);
		}
	}
}

resetField();

Events.on(engine, 'collisionStart', (event) => {
	for (const pair of event.pairs) {
		const { bodyA, bodyB } = pair;

		let playerBody = null;
		if (bodyA === ball && bodyB.label === 'player') playerBody = bodyB;
		else if (bodyB === ball && bodyA.label === 'player') playerBody = bodyA;

		if (playerBody) {
            for (const [id, player] of players) {
                if (player.body === playerBody) {
                    if (player.team === TEAM_A) {
                        goalScored.lastHitA = id;
                    } else if (player.team === TEAM_B) {
                        goalScored.lastHitB = id;
                    }
                    break;
                }
            }
        }        
	}
});

wss.on('connection', (ws) => {
	console.log("Client connected");

	const playerId = Date.now().toString() + "-" + Math.floor(Math.random()*10000).toString();
	players.set(playerId, {
		name: null,
		team: null,
		body: null,
		joinTime: 0,
        number: 0
	});

	ws.on('message', (msg) => {
		let data;
		try {
			data = JSON.parse(msg);
		} catch (e) {
			console.error("Invalid message:", msg);
			return;
		}

		if (data.type === 'join') {
			const pData = players.get(playerId);
			if (!pData) return;

			pData.name = data.playerName || "Anonymous";

			pData.team = assignTeam();
            pData.number = assignNumber(pData.team);

			const spawnBody = createPlayerBody(bounds.width/2, bounds.height/2);
			World.add(engine.world, spawnBody);
			pData.body = spawnBody;

			positionPlayer(pData);
            ws.send(JSON.stringify({ type: 'init', playerId }));
			return;
        } else if (data.type === 'shoot') {
            const pData = players.get(playerId);
            if (!pData || !pData.body) return;
        
            const maxForce = 0.04;
            let fx = data.dx;
            let fy = data.dy;
            const mag = Math.sqrt(fx * fx + fy * fy);
            if (mag > maxForce) {
                fx = (fx / mag) * maxForce;
                fy = (fy / mag) * maxForce;
            }
        
            Body.setVelocity(pData.body, { x: 0, y: 0 });
            Body.applyForce(pData.body, pData.body.position, { x: fx, y: fy });
            return;
        }
	});

	const sendLoop = setInterval(() => {
		const playerState = {};
		for (const [id, pData] of players) {
			if (!pData.body) continue;
			playerState[id] = {
				x: pData.body.position.x,
				y: pData.body.position.y,
				radius: playerRadius,
				name: pData.name,
				team: pData.team,
                number: pData.number
			};
		}

		const ballState = {
			x: ball.position.x,
			y: ball.position.y,
			radius: ballRadius
		};

		ws.send(JSON.stringify({
			type: 'state',
			data: {
				players: playerState,
				ball: ballState,
				scoreA,
				scoreB,
                goalScored,
                winner
			}
		}));
	}, 1000 / 60);

	ws.on('close', () => {
        console.log("Client disconnected");

		const pData = players.get(playerId);
		if (pData && pData.body) {
			World.remove(engine.world, pData.body);
		}
		players.delete(playerId);
		clearInterval(sendLoop);
	});
});

setInterval(() => {
	Engine.update(engine, 1000 / 60);

    if (goalScored.team == null && winner == null) {
        let bx = ball.position.x;
        let by = ball.position.y;
        by = clamp(by, ballRadius, bounds.height - ballRadius);

        if (bx < ballRadius) {
            if (by < goalStartY || by > goalEndY) {
                bx = ballRadius;
            }
        } else if (bx > bounds.width - ballRadius) {
            if (by < goalStartY || by > goalEndY) {
                bx = bounds.width - ballRadius;
            }
        }
        Body.setPosition(ball, { x: bx, y: by });
    }

    players.forEach((playerData) => {
        if (playerData.body) {
            const newX = clamp(playerData.body.position.x, playerRadius, bounds.width - playerRadius);
            const newY = clamp(playerData.body.position.y, playerRadius, bounds.height - playerRadius);
            
            Body.setPosition(playerData.body, { x: newX, y: newY });
        }
    });    

	checkGoal();
}, 1000 / 60);