domready(function () {
	var app = {
		minFreq: 32.7,
		maxFreq: 523.3,
		leap: {
			controller: null,

			updateOscFreq: function(hand, frame){
				for (var leftFingerIndex = 0; leftFingerIndex < hand.fingers.length; leftFingerIndex++) {
					finger = hand.fingers[leftFingerIndex];

					//	1 = INDEX
					if (finger.type===1) {
						coord = frame.interactionBox.normalizePoint(finger.tipPosition, true);

						oscFreq = app.minFreq + app.maxFreq - coord[2]*app.maxFreq;

						// var oscFreq = app.minFreq + coord[2]*app.maxFreq;

						// var pointerCoords = app.display.LeapToScene(frame, finger.tipPosition);
						// app.display.drawPointer(pointerCoords.x, pointerCoords.y, "red");

						app.sound.setOscFreq(-oscFreq);

						var xCanvas = Math.abs(1-coord[2]*window.innerHeight);
						app.display.updateOscFreqDisplay(oscFreq, xCanvas);
					};
				};
			},

			updateFilterFreq: function(hand, frame){
				var fingersAmount = 0;

				for (var rightFingerIndex = 0; rightFingerIndex < hand.fingers.length; rightFingerIndex++) {
					finger = hand.fingers[rightFingerIndex];
					var fingerCoord = frame.interactionBox.normalizePoint(finger.tipPosition, true);
					fingersAmount += fingerCoord[2];
				};

				var averageFinger = fingersAmount/hand.fingers.length;

				var filterFreq = 2000 - averageFinger*2000;
				
				// filter.frequency.value = filterFreq;
				// debugFilterFreq.innerHTML = "Filter freq: "+filterFreq.toFixed(2)+"Hz";


				var yCanvas = 2000 - Math.abs(averageFinger*window.innerWidth);
				app.sound.setFilterFreq(filterFreq);
				app.display.updateFilterFreqDisplay(filterFreq, yCanvas);
			},

			updateReverbTail: function(hand, frame){
				var pinch = hand.pinchStrength.toPrecision(2);
				if (pinch==1 && !app.sound.isReverbConnected) {
					console.log('REVERB ON');
					app.sound.connectReverb();
				} else if (pinch<1 && app.sound.isReverbConnected) {
					console.log('NO MORE REVERB');
					app.sound.disconnectReverb();
				};
			},

			init: function(){

				// LEAP LOOP, Core stuff
				this.controller = Leap.loop({enableGestures: true}, function(frame){
					var hand, finger;

					app.display.ctx.fillStyle = '#003366';
					app.display.ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
					// app.display.drawGrid();

					if (!app.mouse.isDown) {
						if (frame.hands.length>0) {
							for (var handIndex = 0; handIndex < frame.hands.length; handIndex++) {
								var hand = frame.hands[handIndex];

								if (hand.type==="left") {
									app.leap.updateOscFreq(hand, frame);
								};

								if (hand.type==="right") {
									app.leap.updateFilterFreq(hand, frame);
									app.leap.updateReverbTail(hand, frame);
								};
							};
						};
					} else {
						// Play sound!
						var freqs = app.mouse.mouseToHertz();

						app.sound.osc.frequency.value = freqs.oscFreq;
						app.sound.filter.frequency.value = freqs.filterFreq;

						// Clear canvas and redraw pointer
						// app.display.ctx.clearRect(0,0, window.innerWidth, window.innerHeight);
						// app.display.drawPointer(app.mouse.coord.x, app.mouse.coord.y);
						app.display.updateOscFreqDisplay(freqs.oscFreq);
						app.display.updateFilterFreqDisplay(freqs.filterFreq);
					}
					
				});

				// Affichage des mains 3D
				var playground = document.getElementById('canvas');

			    this.controller.use('boneHand', {
					targetEl: document.body,
					arm: true
				})
				// Events entrée/sortie des mains
			    this.controller.use('handEntry');
			    this.controller.on('handFound',
					function(){
						if (!app.sound.osc && !app.mouse.isDown) {
							app.sound.startOsc();	
						};
					}
				);
				this.controller.on('handLost',
					function(){
						if (app.sound.osc) {
							app.sound.stopOsc();
							app.sound.disconnectReverb();
						};
					}
				);

			    // Run
				this.controller.connect();
				Leap.loop();
			}
		},

		mouse: {
			target: null,
			isDown: false,
			coord: {
				x: 0,
				y: 0
			},
			radius: 10,
			mouseToHertz: function(){
				// Entre: objet contenant coordonées X Y du pointeur
				// Sort: objet contenant frequences de l'osciallteur et du filtre
				var height = window.innerHeight;
				var width = window.innerWidth;

				var percentWidth = app.mouse.coord.x/width;
				var percentHeight = app.mouse.coord.y/height;

				var oscFreq = app.minFreq+percentWidth*app.maxFreq;
				var filterFreq = percentHeight*2000;

				return {
					oscFreq: oscFreq,
					filterFreq: Math.abs(filterFreq-2000)
				};
			},
			getClientCoord: function(e){
				app.mouse.coord.x = e.clientX;
				app.mouse.coord.y = e.clientY;
			},
			init: function(){
				this.target = document.body;
				this.target.onmousedown = function(e){
					app.mouse.isDown = true;
					app.sound.startOsc();
				};
				this.target.onmouseup = function(e){
					app.mouse.isDown = false;
					app.sound.stopOsc();
					app.display.ctx.clearRect(0,0, window.innerWidth, window.innerHeight);
					app.mouse.radius = 10;
				};
				this.target.onmousemove = function(e){
					if (app.mouse.isDown) {
						app.mouse.getClientCoord(e);
						app.mouse.radius += 1;
					};
				}
			}
		},

		sound: {
			isReverbConnected: false,

			init: function(){
				// Audio context
				this.ctx 		= new AudioContext();

				// Lowpass filter
				this.filter 	= this.ctx.createBiquadFilter();
				this.filter.Q 	= 1000;

				// Reverb
				this.reverb 	= new SimpleReverb(this.ctx, {
					seconds: 5,
					decay: 3,
					reverse: 0,
				});

				/*
					filter -> reverb
					reverb -> output
					On attend plus que l'osc pour le connecter au filtre et avoir du son
				*/
				this.filter.connect(this.ctx.destination);
				this.reverb.connect(this.ctx.destination);
			},

			toggleOsc: function(){
				if (this.osc) {
					this.stopOsc();
				} else {
					this.startOsc();
				}
			},

			startOsc: function(){
				// Osc
				this.osc = this.ctx.createOscillator();
				this.osc.type = "sawtooth";

				// Connecte osc à notre "rack d'effet"
				this.osc.connect(this.filter);

				// BEEEEEEP
				this.osc.start(this.ctx.currentTime);
			},

			stopOsc: function(){
				this.osc.stop();
				this.osc = null;
			},

			setOscFreq: function(freq){
				if (this.osc) {
					this.osc.frequency.value = freq;
				};
			},

			setFilterFreq: function(freq){
				if (this.filter) {
					this.filter.frequency.value = freq;
				};
			},

			connectReverb: function(){
				this.isReverbConnected = true;
				this.filter.connect(this.reverb.input);
			},

			disconnectReverb: function(){
				this.isReverbConnected = false;
				this.filter.disconnect();
				this.filter.connect(this.ctx.destination);
			}
		},

		display: {

			LeapToScene: function(frame, positionArray){
				var normPosition = frame.interactionBox.normalizePoint(positionArray, true);
				return {
					x: normPosition[0] * window.innerWidth,
					y: window.innerHeight - normPosition[1] * window.innerHeight,
					z: normPosition[2]*500
				}
			},
			
			// Module dysplay gère affichage, gestion élément dom...
			init: function(){
				var toggleSoundBtn = document.getElementById('toggle');
				toggleSoundBtn.onclick = function(){
					app.sound.stopOsc();
				};

				var debugOscFreq = document.getElementById('debug-hand-1');
				this.updateOscFreqDisplay = function(freq, x){
					this.ctx.shadowColor = 'white';
					this.ctx.shadowBlur = 20;
					// app.display.ctx.clearRect(0,0, window.innerWidth, window.innerHeight);

					// app.display.drawLine(x);
					this.ctx.beginPath();
					this.ctx.moveTo(0, x);
					this.ctx.lineTo(window.innerWidth, x);
					this.ctx.strokeStyle = 'white';
					this.ctx.stroke();

					this.ctx.fillText(freq.toFixed(2)+"Hz", 100, x-10);

					// debugOscFreq.innerHTML = "Oscillator freq: "+freq.toFixed(2)+"Hz";
				};
				var debugFilterFreq = document.getElementById('debug-hand-2');
				this.updateFilterFreqDisplay = function(freq, y){
					// debugFilterFreq.innerHTML = "Filter freq: "+freq.toFixed(2)+"Hz";
					this.ctx.beginPath();
					this.ctx.moveTo(0, window.innerHeight-500);
					this.ctx.lineTo(y, window.innerHeight-500);
					this.ctx.quadraticCurveTo(y+250, -100, y+250, window.innerHeight);

					this.ctx.strokeStyle = 'white';
					this.ctx.stroke();

					this.ctx.fillText(freq.toFixed(2)+"Hz", y, 75);
				};

				this.canvas = document.getElementById('canvas');
				this.canvas.width = window.innerWidth;
				this.canvas.height = window.innerHeight;

				this.ctx = this.canvas.getContext('2d');
				this.ctx.font = "20pt Calibri,Geneva,Arial";
			},

			drawPointer: function(x, y){
				this.ctx.beginPath();
				this.ctx.arc(x, y, app.mouse.radius, 0, 2 * Math.PI, false);
				this.ctx.fillStyle = "red";
				this.ctx.fill();
				this.ctx.closePath();
			},

			drawGrid: function(){
				var height = window.innerHeight;
				var width = window.innerWidth;

				var freqArray = [
					{
						freq: 65.4,
						text: "Do 2"
					},
					{
						freq: 130.8,
						text: "Do 3"
					},
					{
						freq: 261.6,
						text: "Do 4"
					},
					{
						freq: 523.2,
						text: "Do 5"
					}
				];

				for (var i = 0; i < freqArray.length; i++) {
					var note = freqArray[i];

					var freq = note.freq/height;

					this.ctx.beginPath();
					this.ctx.moveTo(0, freq);
					this.ctx.lineTo(window.innerWidth, freq);
					this.ctx.strokeStyle = 'white';
					this.ctx.stroke();
				};
				// c2 65.4
			}
		},

		init: function(){
			this.display.init();
			this.sound.init();
			this.leap.init();
			this.mouse.init();
		}
	};
	app.init();
})