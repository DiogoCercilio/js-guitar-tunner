
const Afinador = {
	data: {
		audioFile: "https://upload.wikimedia.org/wikipedia/commons/d/de/Happy_birthday.ogg",
		buf : new Float32Array( 1024 ),
		noteStrings : ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
		MIN_SAMPLES : 0,
		GOOD_ENOUGH_CORRELATION : 0.9,
		isPlaying: false,
		isLiveInput: false
	},

	init() {
		this.cacheDom()
		this.setConfigs()
		this.handleEvents()
	},

	setConfigs() {
		window.AudioContext = window.AudioContext || window.webkitAudioContext
		if (!AudioContext) throw new Error('Sorry! Your Browser is a little bit older...') 

		this.data.audioContext = new AudioContext()
	},

	async getAudio() {
		document.body.classList.add("loading")
		try {
			return new Promise((resolve, reject)=> {	
				fetch(this.data.audioFile)
					.then(res=> res.arrayBuffer())
					.then(res=> this.data.audioContext.decodeAudioData( res, buffer=> {
						document.body.classList.remove("loading")
						this.data.theBuffer = buffer
						this.data.playbackLoaded = true
						resolve(true)
					}))
					.catch(err=> reject())
			})
		} catch(err) {
			this.error(err.message || 'Error on getting audio file')
		}
	},	

	handleEvents() {
		this.$playbackButton.addEventListener('click', ()=> this.togglePlayback())
		this.$liveButton.addEventListener('click', ()=> this.toggleLiveInput())
		this.$oscillatorButton.addEventListener('click', ()=> this.toggleOscillator())
		this.$detectorElem.addEventListener("ondrop", e=> this.ondrop(e))
	},

	ondrop(e) {
		e.preventDefault();

		const reader = new FileReader()

		reader.onload = function (event) {
			this.data.audioContext.decodeAudioData( event.target.result, buffer=> this.data.theBuffer = buffer, ()=> {
				this.error("error loading!")
			}) 
		}

		reader.onerror = event=> this.error( "Error: " + reader.error )
		reader.readAsArrayBuffer(e.dataTransfer.files[0])
	},	
		
	resetState() {
		const self = this === window ? Afinador : this

		if (self.data.sourceNode) {
			self.data.sourceNode.stop( 0 )
			self.data.sourceNode = null
		}

		self.data.analyser = null
		self.data.isPlaying = false

		self.$playbackButton.classList.remove("active")
		self.$liveButton.classList.remove("active")
		self.$oscillatorButton.classList.remove("active")
		
		if (!window.cancelAnimationFrame) window.cancelAnimationFrame = window.webkitCancelAnimationFrame
		window.cancelAnimationFrame( self.data.rafID )
	},	
	
	toggleOscillator() {
		try {
			if (this.data.isPlaying) {
				this.resetState()
				return
			}
	
			this.data.sourceNode = this.data.audioContext.createOscillator()
			this.data.analyser = this.data.audioContext.createAnalyser()
			this.data.analyser.fftSize = 2048
			this.data.sourceNode.connect( this.data.analyser )
			this.data.analyser.connect( this.data.audioContext.destination )
			this.data.sourceNode.start(0)
			this.data.isPlaying = true
			this.data.isLiveInput = false
			this.$oscillatorButton.classList.add("active")

			this.updatePitch()
		} catch(err) {
			this.error('Error trying to toggle Oscillator');
		}	
	},

	toggleLiveInput() {
		
		const self = this === window ? Afinador : this
		
		try {
			if (this.data.isPlaying) {
				this.resetState()
				return
			}
			
			navigator.getUserMedia({
				"audio": {
					"mandatory": {
						"googEchoCancellation": "false",
						"googAutoGainControl": "false",
						"googNoiseSuppression": "false",
						"googHighpassFilter": "false"
					},
					"optional": []
				},
			}, stream=> {
				self.data.mediaStreamSource = self.data.audioContext.createMediaStreamSource(stream)
				self.data.analyser = self.data.audioContext.createAnalyser()
				self.data.analyser.fftSize = 2048
				self.data.mediaStreamSource.connect( self.data.analyser )
				
				self.data.analyser.connect( self.data.audioContext.destination )
				self.data.isPlaying = true
				self.data.isLiveInput = true
				
				self.updatePitch()
				self.$liveButton.classList.add("active")				

			}, this.error)
		} catch (err) {
			console.log(err)
			this.error('Error trying to get user media')
		}
	},
	
	async togglePlayback() {		
		try {
			if (!this.data.playbackLoaded) await this.getAudio()
			if (this.data.isPlaying) {
				this.resetState()
				return
			}

			this.data.sourceNode = this.data.audioContext.createBufferSource()
			this.data.sourceNode.buffer = this.data.theBuffer
			this.data.sourceNode.loop = true
			this.data.analyser = this.data.audioContext.createAnalyser()
			this.data.analyser.fftSize = 2048
			this.data.sourceNode.connect( this.data.analyser )
			this.data.analyser.connect( this.data.audioContext.destination )
			this.data.sourceNode.start( 0 )
			this.data.isPlaying = true
			this.data.isLiveInput = false

			this.updatePitch()
		
			this.$playbackButton.classList.add("active")
		} catch(err) {
			console.log(err)
			this.error('Error trying to togglePlayback')
		}
	},
	
	noteFromPitch( frequency ) {
		var noteNum = 12 * (Math.log( frequency / 440 )/Math.log(2) )
		return Math.round( noteNum ) + 69
	},
	
	frequencyFromNoteNumber( note ) {
		return 440 * Math.pow(2,(note-69)/12)
	},
	
	centsOffFromPitch( frequency, note ) {
		return Math.floor( 1200 * Math.log( frequency / this.frequencyFromNoteNumber( note ))/Math.log(2) )
	},
		
	autoCorrelate() {

		const SIZE = this.data.buf.length
		const MAX_SAMPLES = Math.floor(SIZE/2)
		const correlations = new Array(MAX_SAMPLES)
		
		let best_offset = -1
		let best_correlation = 0
		let foundGoodCorrelation
		let rms = this.data.buf.reduce((total, num)=> total + (num * num), 0)
		
		rms = Math.sqrt(rms/SIZE)
		
		if (rms<0.01) return -1
	
		let lastCorrelation = 1

		for (var offset = this.data.MIN_SAMPLES; offset < MAX_SAMPLES; offset++) {
			var correlation = 0
	
			for (var i=0; i<MAX_SAMPLES; i++) {
				correlation += Math.abs((this.data.buf[i]) - (this.data.buf[i+offset]))
			}
			
			correlation = 1 - (correlation / MAX_SAMPLES)
			correlations[offset] = correlation // store it, for the tweaking we need to do below.

			if ((correlation > this.data.GOOD_ENOUGH_CORRELATION) && (correlation > lastCorrelation)) {
				foundGoodCorrelation = true
				if (correlation > best_correlation) {
					best_correlation = correlation
					best_offset = offset
				}
			} else if (foundGoodCorrelation) {
				var shift = (correlations[best_offset+1] - correlations[best_offset-1])/correlations[best_offset] 
				return this.data.audioContext.sampleRate/(best_offset+(8*shift))
			}

			lastCorrelation = correlation
		}

		best_correlation > 0.01 ? this.data.audioContext.sampleRate / best_offset : -1
	},
	
	updatePitch() {

		const self = (this !== window) ? this : Afinador
		self.data.analyser.getFloatTimeDomainData( self.data.buf )
		const ac = self.autoCorrelate();

		ac == -1 ? self.notRecognized() : self.recognized(ac)

		self.loop()	
	},

	loop() {
		this.data.rafID = window.requestAnimationFrame( this.updatePitch );
	},

	recognized(pitch) {

		this.$detectorElem.className = "confident"

		const note =  this.noteFromPitch( pitch )
		const detune = this.centsOffFromPitch( pitch, note )

		this.$pitchElem.innerText = Math.round( pitch ) 
		this.$noteElem.innerHTML = this.data.noteStrings[note%12] || ""

	   if (detune == 0) {
		   this.$detuneElem.className = ""
		   this.$detuneAmount.innerHTML = "-"
	   } else {
		   	if (detune < 0) {
			   this.$detuneElem.className = "flat" // bemol
			} else {
			   this.$detuneElem.className = "sharp" // sustenido
			   this.$detuneAmount.innerHTML = Math.abs( detune )
		   	}
	   }		
	},

	notRecognized() {
		this.$detectorElem.className = "vague"
		this.$pitchElem.innerText = "-"
		this.$noteElem.innerText = ""
		this.$detuneElem.className = ""
		this.$detuneAmount.innerText = "-"
	},

	error(msg) {
		alert(msg || 'Stream generation failed.')
	},	

	cacheDom() {
		this.$detectorElem = document.getElementById( "detector" )
		this.$pitchElem = document.getElementById( "pitch" )
		this.$pitchFoundElem = document.getElementById( "pitchFound" )
		this.$noteElem = document.getElementById( "note" )
		this.$detuneElem = document.getElementById( "detune" )
		this.$detuneAmount = document.getElementById( "detune_amt" )
		this.$playbackButton = document.getElementById( "useDemo" )
		this.$liveButton = document.getElementById( "useLive" )
		this.$oscillatorButton = document.getElementById( "useOscillator" )
	}
}

window.onload = function() {
	Afinador.init()
}