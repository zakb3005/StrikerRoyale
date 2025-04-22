Vue.createApp({
	data() {
		return {
			socket: null,
			joined: false,
			
			myPlayerId: null,
			playerName: "",
			players: {},
			ball: { x: 0, y: 0, radius: 10 },
			
			scoreA: 0,
			scoreB: 0,
			
			ctx: null,
			gameWidth: 1000,
			gameHeight: 625,
			goalHeight: 125,
	
			dragging: false,
			dragStart: { x: 0, y: 0 },
			dragCurrent: { x: 0, y: 0 },
			maxDragDist: 250,

			bgImg: null,
			goalsImg: null,
			redIcon: null,
			blueIcon: null,
			ballIcon: null,
			ringIcon: null,
			qrImg: null,

			goalScored: false,
			goalTextScale: 20,
			goalMsgY: 20,
			scoreTransparency: 0,
			winnerTextScale: 20,

			lastTimestamp: null,
			winner: null,
			rotation: 0,
			ringRotation: 0,

			crowdLoop: null,
			goalCheer: null,
			endWhistle: null,
			winCheer: null,
			ballHit: null,
			ballHit2: null,
			ballHit3: null,
			
			goalWasPlaying: false,
			winWasPlaying: false,
			soundOn: false,
			spectating: false,
			hideMenu: false
		};
	},

	methods: {
		connectSocket() {
			//this.socket = new WebSocket("ws://localhost:3000");
			this.socket = new WebSocket('https://s25-websocket-zakb3005-production.up.railway.app')

			this.socket.addEventListener("open", () => {
				console.log("Connected to server");
			});

			this.socket.addEventListener("message", (evt) => {
				const msg = JSON.parse(evt.data);
				if (msg.type === 'state') {
					this.players = msg.data.players;
					this.ball = msg.data.ball;
					this.scoreA = msg.data.scoreA;
					this.scoreB = msg.data.scoreB;
					this.goalScored = msg.data.goalScored;
					this.winner = msg.data.winner;
				} else if (msg.type === 'init') {
					this.myPlayerId = msg.playerId;
				} else if (msg.type === 'ballHit') {
					this.playBallHitSound();
				}
			});
		},

		joinGame() {
			if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
			if (!this.playerName.trim()) return;

			this.socket.send(JSON.stringify({
				type: 'join',
				playerName: this.playerName.trim()
			}));

			this.joined = true;
		},

		setupCanvas() {
			const canvas = this.$refs.gameCanvas;
			canvas.width = this.gameWidth;
			canvas.height = this.gameHeight;
			this.ctx = canvas.getContext('2d');
		},		

		limitName(field) {
			this.playerName = field.target.value.slice(0, 12);
		},

		onPointerDown(e) {
			if (!this.joined || !this.myPlayerId || this.dragging) return;
			const { x, y } = this.getGameCoords(e);
			this.dragging = true;
			this.dragStart = { x, y };
			this.dragCurrent = { x, y };
		},
		onPointerMove(e) {
			if (!this.dragging) return;
			const { x, y } = this.getGameCoords(e);
			this.dragCurrent = { x, y };
		},
		onPointerUp(e) {
			if (!this.dragging) return;
			this.dragging = false;
			const { x, y } = this.getGameCoords(e);
			this.dragCurrent = { x, y };
	
			this.sendShootVector();
		},
	
		onTouchStart(e) {
			if (!this.joined || !this.myPlayerId || this.dragging) return;
			e.preventDefault();
			const touch = e.touches[0];
			const { x, y } = this.getGameCoords(touch);
			this.dragging = true;
			this.dragStart = { x, y };
			this.dragCurrent = { x, y };
		},
		onTouchMove(e) {
			if (!this.dragging) return;
			e.preventDefault();
			const touch = e.touches[0];
			const { x, y } = this.getGameCoords(touch);
			this.dragCurrent = { x, y };
		},
		onTouchEnd(e) {
			if (!this.dragging) return;
			e.preventDefault();
			this.dragging = false;
			this.sendShootVector();
		},
	
		getGameCoords(evt) {
			const canvas = this.$refs.gameCanvas;
			const rect   = canvas.getBoundingClientRect();
		  
			const clientX = evt.clientX ?? evt.pageX;
			const clientY = evt.clientY ?? evt.pageY;
		  
			const scaleX = canvas.width  / rect.width;
			const scaleY = canvas.height / rect.height;
		  
			const cx = (clientX - rect.left) * scaleX;
			const cy = (clientY - rect.top)  * scaleY;
		  
			if (this.rotation < 0) {
				return { x: -cy, y: this.gameHeight + cx };
			} else if (this.rotation > 0) {
				return { x: cy, y: this.gameHeight - cx };
			}
		  
			return { x: cx, y: cy };
		  },		  
	
		sendShootVector() {
			const me = this.players[this.myPlayerId];
			if (!me) return;
		
			let rawDx = (this.dragStart.x - this.dragCurrent.x);
			let rawDy = (this.dragStart.y - this.dragCurrent.y);
			const rawMag = Math.sqrt(rawDx * rawDx + rawDy * rawDy);
		
			if (rawMag > this.maxDragDist) {
				rawDx = (rawDx / rawMag) * this.maxDragDist;
				rawDy = (rawDy / rawMag) * this.maxDragDist;
			}
		
			const forceScale = 0.000162; 
			const fx = rawDx * forceScale;
			const fy = rawDy * forceScale;

			const speed = Math.sqrt(fx * fx + fy * fy);
			console.log(`Shoot speed: ${speed.toFixed(5)}`);
		
			this.socket.send(JSON.stringify({
				type: 'shoot',
				dx: fx,
				dy: fy
			}));
		},

		lerp(start, end, amount) {
			return (1 - amount) * start + amount * end;
		},

		playBallHitSound() {
			const sources = [this.ballHit, this.ballHit2, this.ballHit3];
			const original = sources[Math.floor(Math.random() * sources.length)];
		
			const sfx = original.cloneNode();
			sfx.volume = original.volume;
			sfx.play();
		},			

		gameLoop(timestamp) {
			requestAnimationFrame(this.gameLoop);
			if (!this.ctx) return;

			if (this.lastTimestamp === null) {
				this.lastTimestamp = timestamp;
			}
			const delta = (timestamp - this.lastTimestamp) / 1000;
			this.lastTimestamp = timestamp;

			this.rotation = (window.innerWidth <= 540 || window.matchMedia('(orientation: portrait)').matches) ? (this.myPlayerId && this.players[this.myPlayerId].team === "B" ?  Math.PI * 0.5 : -Math.PI * 0.5): 0;

			var canvas = this.$refs.gameCanvas;
			canvas.width  = (this.rotation === 0) ? this.gameWidth : this.gameHeight;
			canvas.height = (this.rotation === 0) ? this.gameHeight : this.gameWidth;

			const ctx = this.ctx;
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.clearRect(0, 0, canvas.width, canvas.height);

			if (this.rotation !== 0) {
				canvas.width = this.gameHeight;
				canvas.height = this.gameWidth;

				if (this.myPlayerId !== null && this.players[this.myPlayerId].team === 'B') {
					ctx.translate(this.gameHeight, 0);
				} else {
					ctx.translate(0, this.gameWidth);
				}
				ctx.rotate(this.rotation);
			} else {
				canvas.width = this.gameWidth;
				canvas.height = this.gameHeight;
			}

			if (this.bgImg && this.bgImg.complete) {
				ctx.drawImage(this.bgImg, 0, 0, this.gameWidth, this.gameHeight);
			} else {
				ctx.fillStyle = 'green';
				ctx.fillRect(0, 0, this.gameWidth, this.gameHeight);
			}

			ctx.font = '40px Bebas Neue';
			ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';

			const blueText = `Blue: ${this.scoreA}`;
			const redText = `Red: ${this.scoreB}`;

			const blueScale = ctx.measureText(blueText);
			const redScale = ctx.measureText(redText);

			ctx.fillText(blueText, (this.gameWidth / 2) - blueScale.width - 15, 45);
			ctx.fillText(redText, (this.gameWidth / 2) + 15, 45);

			if (this.dragging && this.myPlayerId && this.players[this.myPlayerId]) {
				const me = this.players[this.myPlayerId];
				const px = me.x;
				const py = me.y;
			
				let arrowDx = this.dragStart.x - this.dragCurrent.x;
				let arrowDy = this.dragStart.y - this.dragCurrent.y;
				let arrowMag = Math.sqrt(arrowDx * arrowDx + arrowDy * arrowDy);
			
				if (arrowMag > this.maxDragDist) {
					arrowDx = (arrowDx / arrowMag) * this.maxDragDist;
					arrowDy = (arrowDy / arrowMag) * this.maxDragDist;
					arrowMag = this.maxDragDist;
				}
			
				const dirX = arrowDx / arrowMag;
				const dirY = arrowDy / arrowMag;
			
				const lineWidth = me.radius * 2;
				const triangleLength = lineWidth * 0.85;
				const triangleBaseHalf = lineWidth / 2;
			
				const lineEndX = px + arrowDx;
				const lineEndY = py + arrowDy;
			
				const tipX = lineEndX + dirX * triangleLength;
				const tipY = lineEndY + dirY * triangleLength;
			
				const perpX = -dirY;
				const perpY = dirX;
			
				const baseLeftX = lineEndX + perpX * triangleBaseHalf;
				const baseLeftY = lineEndY + perpY * triangleBaseHalf;
				const baseRightX = lineEndX - perpX * triangleBaseHalf;
				const baseRightY = lineEndY - perpY * triangleBaseHalf;
			
				ctx.strokeStyle = 'rgba(0, 0, 0, 0.33)';
				ctx.lineWidth = lineWidth;
				ctx.beginPath();
				ctx.moveTo(px, py);
				ctx.lineTo(lineEndX, lineEndY);
				ctx.stroke();
			
				ctx.fillStyle = 'rgba(0, 0, 0, 0.33)';
				ctx.beginPath();
				ctx.moveTo(tipX, tipY);
				ctx.lineTo(baseLeftX, baseLeftY);
				ctx.lineTo(baseRightX, baseRightY);
				ctx.closePath();
				ctx.fill();
			}			

			if (this.ballIcon && this.ballIcon.complete) {
				const width = this.ball.radius * 2;
				ctx.drawImage(this.ballIcon, this.ball.x - this.ball.radius, this.ball.y - this.ball.radius, width, width);
			} else {
				ctx.fillStyle = 'white';
				ctx.beginPath();
				ctx.arc(this.ball.x, this.ball.y, this.ball.radius, 0, 2 * Math.PI);
				ctx.fill();
			}

			Object.values(this.players).forEach((p) => {
				if (this.ringIcon && this.ringIcon.complete && this.myPlayerId != null && p === this.players[this.myPlayerId]) {
					this.ringRotation += 0.01;
					if (this.ringRotation >= 360) {
						this.ringRotation = 0;
					}
					const imageSize = p.radius * 2 + 5;
					ctx.save();
					ctx.translate(p.x, p.y);
					ctx.rotate(this.ringRotation);
					ctx.drawImage(this.ringIcon, -imageSize / 2, -imageSize / 2, imageSize, imageSize);
					ctx.restore();
				}				

				if (p.team === 'A' && this.blueIcon && this.blueIcon.complete) {
					const width = p.radius * 2;
					ctx.drawImage(this.blueIcon, p.x - p.radius, p.y - p.radius, width, width);
				} else if (p.team === 'B' && this.redIcon && this.redIcon.complete) {
					const width = p.radius * 2;
					ctx.drawImage(this.redIcon, p.x - p.radius, p.y - p.radius, width, width);
				} else {
					ctx.fillStyle = (p.team === 'A') ? 'blue' : (p.team === 'B') ? 'red' : 'yellow';
					ctx.beginPath();
					ctx.arc(p.x, p.y, p.radius, 0, 2 * Math.PI);
					ctx.fill();

					if (p.name) {
						ctx.fillStyle = 'white';
						ctx.font = '14px sans-serif';
						ctx.fillText(p.name, p.x - 10, p.y - p.radius - 8);
					}
				}

				const numText = p.number;
				ctx.font = '18px Bebas Neue';
				ctx.fillStyle = 'rgba(255, 255, 255, 1)';
				const numScale = ctx.measureText(numText);
				const numHeight = numScale.actualBoundingBoxAscent + numScale.actualBoundingBoxDescent;
				ctx.fillText(numText, p.x - (numScale.width*0.5), p.y + (numHeight*0.5));

				const nameText = p.name;
				ctx.font = '18px Bebas Neue';
				ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
				const nameScale = ctx.measureText(nameText);
				const nameHeight = nameScale.actualBoundingBoxAscent + nameScale.actualBoundingBoxDescent;
				ctx.fillText(nameText, p.x - (nameScale.width*0.5), p.y + (p.radius) + 16 + (nameHeight*0.5));
			});

			if (this.goalsImg && this.goalsImg.complete) {
				ctx.drawImage(this.goalsImg, 0, 0, this.gameWidth, this.gameHeight);
			} else {
				const goalStartY = (this.gameHeight - this.goalHeight) / 2;
				const goalEndY = goalStartY + this.goalHeight;

				ctx.strokeStyle = 'white';
				ctx.lineWidth = 8;

				ctx.beginPath();
				ctx.moveTo(0, goalStartY);
				ctx.lineTo(0, goalEndY);
				ctx.stroke();

				ctx.beginPath();
				ctx.moveTo(this.gameWidth, goalStartY);
				ctx.lineTo(this.gameWidth, goalEndY);
				ctx.stroke();
			}

			if (this.goalScored.team != null) {
				if (!this.goalWasPlaying && this.soundOn) {
					this.goalCheer.play();
				}
				this.goalWasPlaying = true;

				this.goalTextScale = this.lerp(this.goalTextScale, 160, 4 * delta);

				if (this.goalTextScale > 150) {
					this.goalMsgY = this.lerp(this.goalMsgY, 120, 2.5 * delta);
					
					let fillStyle = 'rgba(30, 60, 210)';
					let goalMsg = 'Blue Team Goal';

					if (this.goalScored.team === 'B') {
						fillStyle = 'rgba(210, 20, 20)';
						goalMsg = 'Red Team Goal';
					}

					const scorerId = (this.goalScored.team === 'A') ? this.goalScored.lastHitA : this.goalScored.lastHitB;
					if (scorerId && this.players[scorerId]) {
						const scorerName = this.players[scorerId].name || 'Anonymous';
						goalMsg = `Scored by ${scorerName}`;
					}


					ctx.font = `42px Bebas Neue`;
					ctx.fillStyle = fillStyle;
					const msgTextScale = ctx.measureText(goalMsg);
					const msgTextHeight = msgTextScale.actualBoundingBoxAscent + msgTextScale.actualBoundingBoxDescent;
					ctx.lineWidth = 8;
					ctx.strokeStyle = 'rgb(23, 23, 24)';
					ctx.strokeText(goalMsg, (this.gameWidth*0.5) - (msgTextScale.width*0.5), (this.gameHeight*0.5) + (msgTextHeight*0.5) + this.goalMsgY);
					ctx.fillText(goalMsg, (this.gameWidth*0.5) - (msgTextScale.width*0.5), (this.gameHeight*0.5) + (msgTextHeight*0.5) + this.goalMsgY);

					if (this.goalMsgY > 110) {
						this.scoreTransparency = this.lerp(this.scoreTransparency, 1, 3 * delta);
						ctx.strokeStyle = `rgb(23, 23, 24, ${this.scoreTransparency})`;

						blueTxt = `${this.scoreA}`;
						ctx.font = `90px Bebas Neue`;
						ctx.fillStyle = `rgba(30, 60, 210, ${this.scoreTransparency})`;
						const blueTxtScale = ctx.measureText(blueTxt);
						const blueTxtHeight = blueTxtScale.actualBoundingBoxAscent + blueTxtScale.actualBoundingBoxDescent;
						ctx.lineWidth = 10;
						ctx.strokeText(blueTxt, (this.gameWidth*0.5) - (blueTxtScale.width) - 20, (this.gameHeight*0.5) + (blueTxtHeight*0.5) + 210);
						ctx.fillText(blueTxt, (this.gameWidth*0.5) - (blueTxtScale.width) - 20, (this.gameHeight*0.5) + (blueTxtHeight*0.5) + 210);

						redTxt = `${this.scoreB}`;
						ctx.font = `90px Bebas Neue`;
						ctx.fillStyle = `rgba(210, 20, 20, ${this.scoreTransparency})`;
						const redTxtScale = ctx.measureText(redTxt);
						const redTxtHeight = redTxtScale.actualBoundingBoxAscent + redTxtScale.actualBoundingBoxDescent;
						ctx.lineWidth = 10;
						ctx.strokeText(redTxt, (this.gameWidth*0.5) + 20, (this.gameHeight*0.5) + (redTxtHeight*0.5) + 210);
						ctx.fillText(redTxt, (this.gameWidth*0.5) + 20, (this.gameHeight*0.5) + (redTxtHeight*0.5) + 210);
					}
				}
				
				var fillStyle = 'rgba(30, 60, 210)';
				if (this.goalScored.team == 'B') {
					fillStyle = 'rgba(210, 20, 20)';
				}
				
				const goalText = "GOAL!"
				ctx.font = `${this.goalTextScale}px Bebas Neue`;
				ctx.fillStyle = fillStyle;
				const goalTextScale = ctx.measureText(goalText);
				const goalTextHeight = goalTextScale.actualBoundingBoxAscent + goalTextScale.actualBoundingBoxDescent;
				ctx.lineWidth = 16;
				ctx.strokeStyle = 'rgb(23, 23, 24)';

				ctx.strokeText(goalText, (this.gameWidth*0.5) - (goalTextScale.width*0.5), (this.gameHeight*0.5) + (goalTextHeight*0.5));
				ctx.fillText(goalText, (this.gameWidth*0.5) - (goalTextScale.width*0.5), (this.gameHeight*0.5) + (goalTextHeight*0.5));
			} else if (this.goalScored.team == null) {
				this.goalWasPlaying = false;
				this.goalTextScale = 20;
				this.goalMsgY = 20;
				this.scoreTransparency = 0;
			}

			if (this.winner != null) {
				if (!this.winWasPlaying && this.soundOn) {
					this.endWhistle.play();
					this.winCheer.play();
				}
				this.winWasPlaying = true;
				this.winnerTextScale = this.lerp(this.winnerTextScale, 160, 4 * delta);

				var fillStyle = 'rgba(30, 60, 210)';
				var winText = "Blue Team Wins!";
				if (this.winner == 'B') {
					fillStyle = 'rgba(210, 20, 20)';
					winText = "Red Team Wins!";
				}
				
				ctx.font = `${this.winnerTextScale}px Bebas Neue`;
				ctx.fillStyle = fillStyle;
				const winnerTextScale = ctx.measureText(winText);
				const winnerTextHeight = winnerTextScale.actualBoundingBoxAscent + winnerTextScale.actualBoundingBoxDescent;
				ctx.lineWidth = 18;
				ctx.strokeStyle = 'rgb(23, 23, 24)';

				ctx.strokeText(winText, (this.gameWidth*0.5) - (winnerTextScale.width*0.5), (this.gameHeight*0.5) + (winnerTextHeight*0.5));
				ctx.fillText(winText, (this.gameWidth*0.5) - (winnerTextScale.width*0.5), (this.gameHeight*0.5) + (winnerTextHeight*0.5));
			} else {
				this.winnerTextScale = 20;
				this.winWasPlaying = false;
			}

			const qrWidth = 150;
			if (this.spectating && this.qrImg && this.qrImg.complete) {
				ctx.drawImage(this.qrImg, this.gameWidth-qrWidth-20, 20, qrWidth, qrWidth);

				ctx.font = `60px Bebas Neue`;
				ctx.fillStyle = `rgba(0,0,0,0.75)`
				const joinTextScale = ctx.measureText("Join in!");
				const joinTextHeight = joinTextScale.actualBoundingBoxAscent + joinTextScale.actualBoundingBoxDescent;
				ctx.lineWidth = 18;

				ctx.fillText("Join in!", ((this.gameWidth - qrWidth - joinTextScale.width - 35)), 40 + joinTextHeight * 0.5);
			}
		},
		/*
		sendInput(action) {
			if (!this.joined) return;
			if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
			this.socket.send(JSON.stringify({ action }));
		}
		*/
	},

	mounted() {
		this.setupCanvas();
		this.connectSocket();

		this.bgImg = new Image();
		this.bgImg.src = "images/Field.png";
		this.goalsImg = new Image();
		this.goalsImg.src = "images/Goals.png";
		this.redIcon = new Image();
		this.redIcon.src = "images/Red.png";
		this.blueIcon = new Image();
		this.blueIcon.src = "images/Blue.png";
		this.ballIcon = new Image();
		this.ballIcon.src = "images/Ball.png";
		this.ringIcon = new Image();
		this.ringIcon.src = "images/Ring.png";
		this.qrImg = new Image();
		this.qrImg.src = "images/QR.png";

		this.crowdLoop = new Audio('audio/crowd_loop.ogg');
		this.crowdLoop.volume = 0.2;
		this.crowdLoop.loop = true;
		this.goalCheer = new Audio('audio/goal_cheer.mp3');
		this.goalCheer.volume = 0.6;
		this.winCheer = new Audio('audio/win_cheer.mp3');
		this.winCheer.volume = 0.6;
		this.endWhistle = new Audio('audio/end_whistle.mp3');
		this.ballHit = new Audio('audio/ball_hit.mp3');
		this.ballHit.volume = 0.35
		this.ballHit2 = new Audio('audio/ball_hit2.mp3');
		this.ballHit2.volume = 0.35
		this.ballHit3 = new Audio('audio/ball_hit3.mp3');
		this.ballHit3.volume = 0.35
	
		window.addEventListener('mousedown', this.onPointerDown);
		window.addEventListener('mousemove', this.onPointerMove);
		window.addEventListener('mouseup', this.onPointerUp);
		window.addEventListener('mouseleave', this.onPointerUp);
	
		window.addEventListener('touchstart', this.onTouchStart, { passive: false });
		window.addEventListener('touchmove', this.onTouchMove, { passive: false });
		window.addEventListener('touchend', this.onTouchEnd);
		window.addEventListener('touchcancel', this.onTouchEnd);

		if (!('ontouchstart' in window)) {
			window.addEventListener('keydown', (e) => {
				if (e.key.toLowerCase() === 'p') {
					this.spectating = !this.spectating;
				} else if (e.key.toLowerCase() === 'm') {
					this.hideMenu = !this.hideMenu;
				} else if (e.key.toLowerCase() === 'n') {
					this.soundOn = true;
					this.crowdLoop.play();
				}
			});
		};
	
		this.gameLoop();
	}	
}).mount("#app");