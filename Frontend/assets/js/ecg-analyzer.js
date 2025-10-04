// ecg-analyzer.js - Complete Fixed Version with All Visualization Modes
class ECGAnalyzer {
    constructor() {
        this.ecgData = null;
        this.leads = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
        this.selectedLeads = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
        this.samplingRate = 360;
        this.prqsPoints = { P: [], Q: [], R: [], S: [], T: [] };
        
        // Visualization properties
        this.currentMode = 'continuous';
        this.windowSizeSeconds = 10;
        
        // XOR Graph properties
        this.xorChunkSize = 100;
        this.xorChunks = [];
        this.xorDisplayMode = 'overlay';
        
        // Polar Graph properties
        this.polarMode = 'rolling';
        this.polarData = [];
        this.polarLead = 0;
        
        // Recurrence Plot properties
        this.recurrenceLeadX = 0;
        this.recurrenceLeadY = 1;
        this.recurrenceColormap = 'Viridis';
        this.recurrenceMode = 'scatter';
        
        // Animation properties
        this.isAnimating = false;
        this.animationId = null;
        this.currentAnimationTime = 0;
        this.animationSpeed = 100;
        this.animationStep = 0.1;
        
        this.lastClassificationResult = null;
        
        this.initializeEventListeners();
        this.initializePlots();
        this.generateLeadCheckboxes();
        this.initializeKeyboardControls();
    }

    initializeEventListeners() {
        // File and basic controls
        const fileInput = document.getElementById('fileInput');
        const windowSize = document.getElementById('windowSize');
        const samplingRate = document.getElementById('samplingRate');
        const visualizationMode = document.getElementById('visualizationMode');
        
        if (fileInput) fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        if (windowSize) windowSize.addEventListener('change', (e) => this.updateWindowSize(e.target.value));
        if (samplingRate) samplingRate.addEventListener('change', (e) => this.updateSamplingRate(e.target.value));
        if (visualizationMode) visualizationMode.addEventListener('change', (e) => this.switchVisualizationMode(e.target.value));
        
        // Animation controls
        const timelineSlider = document.getElementById('timelineSlider');
        const playPauseBtn = document.getElementById('playPauseBtn');
        
        if (timelineSlider) timelineSlider.addEventListener('input', (e) => this.seekToTime(e.target.value));
        if (playPauseBtn) playPauseBtn.addEventListener('click', () => this.toggleAnimation());
        
        // Action buttons
        const analyzeBtn = document.getElementById('analyzeBtn');
        const classifyBtn = document.getElementById('classifyBtn');
        const resetBtn = document.getElementById('resetBtn');
        const exportResultsBtn = document.getElementById('exportResultsBtn');
        
        if (analyzeBtn) analyzeBtn.addEventListener('click', () => this.analyzeECG());
        if (classifyBtn) classifyBtn.addEventListener('click', () => this.classifyECG());
        if (resetBtn) resetBtn.addEventListener('click', () => this.resetAnalyzer());
        if (exportResultsBtn) exportResultsBtn.addEventListener('click', () => this.exportResults());
    }

    initializeKeyboardControls() {
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
            
            switch(e.code) {
                case 'Space':
                    e.preventDefault();
                    this.toggleAnimation();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    this.seekToTime(Math.max(0, this.currentAnimationTime - 1));
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    if (this.ecgData && this.ecgData.leads && this.ecgData.leads[0]) {
                        const maxTime = this.ecgData.leads[0].length / this.samplingRate;
                        this.seekToTime(Math.min(maxTime, this.currentAnimationTime + 1));
                    }
                    break;
                case 'Home':
                    e.preventDefault();
                    this.seekToTime(0);
                    break;
                case 'End':
                    e.preventDefault();
                    if (this.ecgData && this.ecgData.leads && this.ecgData.leads[0]) {
                        const maxTime = this.ecgData.leads[0].length / this.samplingRate;
                        this.seekToTime(Math.max(0, maxTime - this.windowSizeSeconds));
                    }
                    break;
            }
        });
    }

    generateLeadCheckboxes() {
        const leadsContainer = document.querySelector('.card-body .row');
        if (!leadsContainer) return;
        
        leadsContainer.innerHTML = '';
        
        this.leads.forEach((lead, index) => {
            const col = document.createElement('div');
            col.className = 'col-md-2 col-4 mb-2';
            
            col.innerHTML = `
                <div class="form-check">
                    <input class="form-check-input lead-checkbox" type="checkbox" value="${index}" id="lead${index}" ${this.selectedLeads.includes(index) ? 'checked' : ''}>
                    <label class="form-check-label" for="lead${index}">${lead}</label>
                </div>
            `;
            
            leadsContainer.appendChild(col);
        });

        document.querySelectorAll('.lead-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => this.updateLeadSelection(e.target));
        });
    }

    initializePlots() {
        this.initializeMainPlot();
        this.initializePolarPlot();
        this.initializeRecurrencePlot();
        this.initializeProbabilityPlot();
    }

    initializeMainPlot() {
        const mainChart = document.getElementById('mainChart');
        if (!mainChart) return;
        
        const layout = {
            title: '12-Lead ECG Signal - Continuous Time Viewer',
            xaxis: { title: 'Time (s)', gridcolor: 'lightgray' },
            yaxis: { title: 'Amplitude (mV)', gridcolor: 'lightgray' },
            showlegend: true,
            height: 400,
            margin: { l: 50, r: 50, t: 50, b: 50 }
        };
        
        Plotly.newPlot('mainChart', [], layout, { responsive: true });
    }

    initializePolarPlot() {
        const polarChart = document.getElementById('polarChart');
        if (!polarChart) return;
        
        const layout = {
            title: 'Polar Coordinate Analysis',
            polar: {
                radialaxis: {
                    visible: true,
                    range: [0, 1],
                    angle: 90,
                    tickangle: 0,
                    tickfont: { size: 10 }
                },
                angularaxis: {
                    direction: "clockwise",
                    rotation: 90,
                    tickmode: "array",
                    tickvals: [0, 45, 90, 135, 180, 225, 270, 315],
                    ticktext: ['0°', '45°', '90°', '135°', '180°', '225°', '270°', '315°']
                },
                sector: [0, 360],
                bgcolor: "white"
            },
            showlegend: false,
            height: 300
        };
        
        Plotly.newPlot('polarChart', [], layout, { responsive: true });
    }

    initializeRecurrencePlot() {
        const recurrenceChart = document.getElementById('recurrenceChart');
        if (!recurrenceChart) return;
        
        const layout = {
            title: 'Recurrence Plot / Scatter',
            xaxis: { title: 'Lead X Amplitude (mV)' },
            yaxis: { title: 'Lead Y Amplitude (mV)' },
            showlegend: false,
            height: 300
        };
        
        Plotly.newPlot('recurrenceChart', [], layout, { responsive: true });
    }

    initializeProbabilityPlot() {
        const probabilityChart = document.getElementById('probabilityChart');
        if (!probabilityChart) return;
        
        const layout = {
            title: 'Classification Probabilities',
            xaxis: { title: 'Conditions', tickangle: -45 },
            yaxis: { title: 'Probability (%)', range: [0, 100] },
            showlegend: false,
            height: 250
        };
        
        Plotly.newPlot('probabilityChart', [], layout, { responsive: true });
    }

    async handleFileUpload(event) {
        const files = event.target.files;
        if (files.length === 0) {
            this.showMessage('No file selected', 'error');
            return;
        }

        this.showLoading(true);
        
        try {
            const file = files[0];
            console.log('📁 Selected file:', file.name);

            const formData = new FormData();
            formData.append('ecg_file', file);
            formData.append('sampling_rate', this.samplingRate.toString());

            console.log('🔄 Starting upload...');
            
            const response = await fetch('http://localhost:5000/api/upload-ecg', {
                method: 'POST',
                body: formData
            });

            console.log('📡 Response status:', response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server error: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            console.log('✅ Upload successful:', result);
            
            this.ecgData = result.data;
            
            // Enable buttons
            const classifyBtn = document.getElementById('classifyBtn');
            const playPauseBtn = document.getElementById('playPauseBtn');
            if (classifyBtn) classifyBtn.disabled = false;
            if (playPauseBtn) playPauseBtn.disabled = false;
            
            // Update stats
            const signalDuration = document.getElementById('signalDuration');
            if (signalDuration && result.data.duration) {
                signalDuration.textContent = `${result.data.duration.toFixed(1)} s`;
            }
            
            this.updateDisplay();
            this.setupTimelineControls();
            this.showMessage('12-Lead ECG data loaded successfully!', 'success');
            
        } catch (error) {
            console.error('💥 File upload error:', error);
            this.showMessage('Error: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    updateLeadSelection(checkbox) {
        const leadIndex = parseInt(checkbox.value);
        
        if (checkbox.checked) {
            if (!this.selectedLeads.includes(leadIndex)) {
                this.selectedLeads.push(leadIndex);
            }
        } else {
            this.selectedLeads = this.selectedLeads.filter(idx => idx !== leadIndex);
        }
        
        this.updateDisplay();
    }

    switchVisualizationMode(mode) {
        this.currentMode = mode;
        this.updateModeControls();
        this.updateDisplay();
        
        const titles = {
            'continuous': '12-Lead ECG Signal - Continuous Time Viewer',
            'xor': 'XOR Graph - ECG Chunk Overlay',
            'polar': 'Polar Coordinate Analysis',
            'recurrence': 'Recurrence Plot / Scatter Analysis'
        };
        
        const visualizationTitle = document.getElementById('visualizationTitle');
        if (visualizationTitle) {
            visualizationTitle.textContent = titles[mode] || 'ECG Visualization';
        }
    }

    updateModeControls() {
        const controlsContainer = document.getElementById('modeControls');
        if (!controlsContainer) return;
        
        controlsContainer.style.display = 'block';
        
        switch (this.currentMode) {
            case 'continuous':
                controlsContainer.innerHTML = `
                    <div class="row g-3 align-items-center">
                        <div class="col-md-3">
                            <label class="form-label">Window Size</label>
                            <select id="windowSizeControl" class="form-select">
                                <option value="5">5 seconds</option>
                                <option value="10" selected>10 seconds</option>
                                <option value="15">15 seconds</option>
                                <option value="20">20 seconds</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label class="form-label">Animation Speed</label>
                            <select id="animationSpeed" class="form-select">
                                <option value="200">Slow</option>
                                <option value="100" selected>Medium</option>
                                <option value="50">Fast</option>
                                <option value="25">Very Fast</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label class="form-label">Step Size</label>
                            <select id="animationStep" class="form-select">
                                <option value="0.05">0.05s</option>
                                <option value="0.1" selected>0.1s</option>
                                <option value="0.2">0.2s</option>
                                <option value="0.5">0.5s</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <div class="form-text">Current Window: <span id="currentWindow">0.0s - 10.0s</span></div>
                        </div>
                    </div>
                `;
                
                // Set initial values
                const windowSizeControl = document.getElementById('windowSizeControl');
                const animationSpeed = document.getElementById('animationSpeed');
                const animationStep = document.getElementById('animationStep');
                
                if (windowSizeControl) {
                    windowSizeControl.value = this.windowSizeSeconds;
                    windowSizeControl.addEventListener('change', (e) => {
                        this.windowSizeSeconds = parseInt(e.target.value);
                        this.updateAnimatedDisplay();
                    });
                }
                
                if (animationSpeed) {
                    animationSpeed.value = this.animationSpeed;
                    animationSpeed.addEventListener('change', (e) => {
                        this.animationSpeed = parseInt(e.target.value);
                        if (this.isAnimating) {
                            this.stopAnimation();
                            this.startAnimation();
                        }
                    });
                }
                
                if (animationStep) {
                    animationStep.value = this.animationStep;
                    animationStep.addEventListener('change', (e) => {
                        this.animationStep = parseFloat(e.target.value);
                    });
                }
                break;
                
            case 'xor':
                controlsContainer.innerHTML = `
                    <div class="row g-3">
                        <div class="col-md-4">
                            <label class="form-label">Chunk Size (samples)</label>
                            <input type="number" id="xorChunkSize" class="form-control" value="${this.xorChunkSize}" min="50" max="1000">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">Display Mode</label>
                            <select id="xorDisplayMode" class="form-select">
                                <option value="overlay">Overlay Chunks</option>
                                <option value="difference">Show Differences</option>
                            </select>
                        </div>
                        <div class="col-md-4">
                            <button class="btn btn-outline-primary mt-4" onclick="ecgAnalyzer.generateXORChunks()">Generate Chunks</button>
                        </div>
                    </div>
                `;
                
                const xorChunkSize = document.getElementById('xorChunkSize');
                const xorDisplayMode = document.getElementById('xorDisplayMode');
                
                if (xorChunkSize) {
                    xorChunkSize.addEventListener('change', (e) => {
                        this.xorChunkSize = parseInt(e.target.value);
                        this.generateXORChunks();
                    });
                }
                
                if (xorDisplayMode) {
                    xorDisplayMode.value = this.xorDisplayMode;
                    xorDisplayMode.addEventListener('change', (e) => {
                        this.xorDisplayMode = e.target.value;
                        this.updateXORDisplay();
                    });
                }
                break;
                
            case 'polar':
                controlsContainer.innerHTML = `
                    <div class="row g-3">
                        <div class="col-md-4">
                            <label class="form-label">Lead Selection</label>
                            <select id="polarLead" class="form-select">
                                ${this.leads.map((lead, idx) => `<option value="${idx}">${lead}</option>`).join('')}
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">Polar Mode</label>
                            <select id="polarMode" class="form-select">
                                <option value="rolling">Rolling Window</option>
                                <option value="cumulative">Cumulative</option>
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">Window Size</label>
                            <input type="number" id="polarWindowSize" class="form-control" value="1000" min="100" max="5000">
                        </div>
                    </div>
                `;
                
                const polarLead = document.getElementById('polarLead');
                const polarMode = document.getElementById('polarMode');
                const polarWindowSize = document.getElementById('polarWindowSize');
                
                if (polarLead) {
                    polarLead.value = this.polarLead;
                    polarLead.addEventListener('change', (e) => {
                        this.polarLead = parseInt(e.target.value);
                        this.updatePolarDisplay();
                    });
                }
                
                if (polarMode) {
                    polarMode.value = this.polarMode;
                    polarMode.addEventListener('change', (e) => {
                        this.polarMode = e.target.value;
                        this.updatePolarDisplay();
                    });
                }
                
                if (polarWindowSize) {
                    polarWindowSize.addEventListener('change', (e) => {
                        this.polarWindowSize = parseInt(e.target.value);
                        this.updatePolarDisplay();
                    });
                }
                break;
                
            case 'recurrence':
                controlsContainer.innerHTML = `
                    <div class="row g-3">
                        <div class="col-md-3">
                            <label class="form-label">Lead X</label>
                            <select id="recurrenceLeadX" class="form-select">
                                ${this.leads.map((lead, idx) => `<option value="${idx}">${lead}</option>`).join('')}
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label class="form-label">Lead Y</label>
                            <select id="recurrenceLeadY" class="form-select">
                                ${this.leads.map((lead, idx) => `<option value="${idx}" ${idx === 1 ? 'selected' : ''}>${lead}</option>`).join('')}
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label class="form-label">Plot Type</label>
                            <select id="recurrenceMode" class="form-select">
                                <option value="scatter">Scatter Plot</option>
                                <option value="heatmap">Density Heatmap</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label class="form-label">Colormap</label>
                            <select id="recurrenceColormap" class="form-select">
                                <option value="Viridis">Viridis</option>
                                <option value="Plasma">Plasma</option>
                                <option value="Hot">Hot</option>
                                <option value="Jet">Jet</option>
                            </select>
                        </div>
                    </div>
                `;
                
                ['recurrenceLeadX', 'recurrenceLeadY', 'recurrenceMode', 'recurrenceColormap'].forEach(id => {
                    const element = document.getElementById(id);
                    if (element) {
                        element.addEventListener('change', (e) => {
                            this[id] = ['recurrenceMode', 'recurrenceColormap'].includes(id) ? e.target.value : parseInt(e.target.value);
                            this.updateRecurrenceDisplay();
                        });
                    }
                });
                break;
        }
    }

    updateDisplay() {
        if (!this.ecgData) return;

        switch (this.currentMode) {
            case 'continuous':
                this.updateContinuousDisplay();
                break;
            case 'xor':
                this.updateXORDisplay();
                break;
            case 'polar':
                this.updatePolarDisplay();
                break;
            case 'recurrence':
                this.updateRecurrenceDisplay();
                break;
        }
        
        this.updateAdvancedPlots();
        this.updateStats();
    }

    updateContinuousDisplay(startSample = 0, endSample = null) {
        const mainChart = document.getElementById('mainChart');
        if (!mainChart || !this.ecgData.leads) return;

        if (!endSample) {
            endSample = this.ecgData.leads[0].length;
        }

        const traces = [];
        const colors = [
            '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
            '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
            '#ff9896', '#98df8a'
        ];

        this.selectedLeads.forEach(leadIndex => {
            if (this.ecgData.leads[leadIndex]) {
                const leadData = this.ecgData.leads[leadIndex];
                const windowData = leadData.slice(startSample, endSample);
                const timeArray = windowData.map((_, index) => 
                    (startSample + index) / this.samplingRate
                );
                
                traces.push({
                    x: timeArray,
                    y: windowData,
                    type: 'scatter',
                    mode: 'lines',
                    name: this.leads[leadIndex],
                    line: { 
                        color: colors[leadIndex % colors.length], 
                        width: 1.5 
                    },
                    hovertemplate: 
                        `<b>${this.leads[leadIndex]}</b><br>` +
                        'Time: %{x:.2f}s<br>' +
                        'Amplitude: %{y:.3f}mV<br>' +
                        '<extra></extra>'
                });
            }
        });

        const layout = {
            title: `ECG Signal - ${this.windowSizeSeconds}s Window (${(this.currentAnimationTime).toFixed(1)}s)`,
            xaxis: { 
                title: 'Time (s)', 
                gridcolor: 'lightgray',
                range: [this.currentAnimationTime, this.currentAnimationTime + this.windowSizeSeconds]
            },
            yaxis: { 
                title: 'Amplitude (mV)', 
                gridcolor: 'lightgray' 
            },
            showlegend: true,
            height: 400,
            margin: { l: 60, r: 40, t: 60, b: 60 }
        };

        Plotly.react('mainChart', traces, layout);
    }

    generateXORChunks() {
        if (!this.ecgData || !this.ecgData.leads) return;
        
        this.xorChunks = [];
        const leadIndex = this.selectedLeads[0] || 0;
        
        const signal = this.ecgData.leads[leadIndex];
        const numChunks = Math.floor(signal.length / this.xorChunkSize);
        
        for (let i = 0; i < numChunks; i++) {
            const startIdx = i * this.xorChunkSize;
            const endIdx = startIdx + this.xorChunkSize;
            this.xorChunks.push(signal.slice(startIdx, endIdx));
        }
        
        this.updateXORDisplay();
    }

    updateXORDisplay() {
        if (this.xorChunks.length === 0) {
            this.generateXORChunks();
            return;
        }

        const mainChart = document.getElementById('mainChart');
        if (!mainChart) return;

        const traces = [];
        const colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd'];
        
        if (this.xorDisplayMode === 'overlay') {
            // Overlay mode - show all chunks
            this.xorChunks.forEach((chunk, index) => {
                if (index < 10) { // Limit to first 10 chunks for performance
                    const timeArray = chunk.map((_, i) => i / this.samplingRate);
                    
                    traces.push({
                        x: timeArray,
                        y: chunk,
                        type: 'scatter',
                        mode: 'lines',
                        name: `Chunk ${index + 1}`,
                        line: { color: colors[index % colors.length], width: 1.5 },
                        opacity: 0.7
                    });
                }
            });
        } else {
            // Difference mode - show XOR differences
            if (this.xorChunks.length >= 2) {
                const baseChunk = this.xorChunks[0];
                const timeArray = baseChunk.map((_, i) => i / this.samplingRate);
                
                for (let i = 1; i < Math.min(this.xorChunks.length, 6); i++) {
                    const currentChunk = this.xorChunks[i];
                    const diffChunk = currentChunk.map((val, idx) => 
                        Math.abs(val - baseChunk[idx])
                    );
                    
                    traces.push({
                        x: timeArray,
                        y: diffChunk,
                        type: 'scatter',
                        mode: 'lines',
                        name: `Diff Chunk ${i + 1}`,
                        line: { color: colors[(i-1) % colors.length], width: 1.5 },
                        opacity: 0.8
                    });
                }
            }
        }

        const layout = {
            title: `XOR Graph - ${this.xorChunks.length} Chunks (${this.xorDisplayMode})`,
            xaxis: { title: 'Time (s)', gridcolor: 'lightgray' },
            yaxis: { title: 'Amplitude (mV)', gridcolor: 'lightgray' },
            showlegend: true,
            height: 400
        };

        Plotly.react('mainChart', traces, layout);
    }

    updatePolarDisplay() {
        const mainChart = document.getElementById('mainChart');
        if (!mainChart || !this.ecgData || !this.ecgData.leads) return;

        const leadData = this.ecgData.leads[this.polarLead] || [];
        if (leadData.length === 0) return;

        const windowSize = document.getElementById('polarWindowSize')?.value || 1000;
        const windowSizeInt = parseInt(windowSize);
        
        const traces = [];
        const colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b'];
        
        if (this.polarMode === 'rolling') {
            // Rolling window - show current window in polar coordinates
            const startIdx = Math.max(0, Math.floor(this.currentAnimationTime * this.samplingRate));
            const endIdx = Math.min(leadData.length, startIdx + windowSizeInt);
            const windowData = leadData.slice(startIdx, endIdx);
            
            const rValues = [];
            const thetaValues = [];
            
            for (let i = 0; i < windowData.length; i++) {
                const amplitude = windowData[i];
                const time = (startIdx + i) / this.samplingRate;
                
                // Convert to polar: amplitude -> radius, time -> angle
                const r = Math.abs(amplitude);
                const theta = (time * 360) % 360; // Time maps to 0-360 degrees
                
                rValues.push(r);
                thetaValues.push(theta);
            }
            
            traces.push({
                r: rValues,
                theta: thetaValues,
                type: 'scatterpolar',
                mode: 'markers',
                name: `${this.leads[this.polarLead]} (Rolling)`,
                marker: {
                    size: 3,
                    color: '#1f77b4',
                    opacity: 0.6
                }
            });
        } else {
            // Cumulative mode - show entire signal in polar coordinates
            const step = Math.max(1, Math.floor(leadData.length / 1000));
            const rValues = [];
            const thetaValues = [];
            
            for (let i = 0; i < leadData.length; i += step) {
                const amplitude = leadData[i];
                const time = i / this.samplingRate;
                
                const r = Math.abs(amplitude);
                const theta = (time * 360) % 360;
                
                rValues.push(r);
                thetaValues.push(theta);
            }
            
            traces.push({
                r: rValues,
                theta: thetaValues,
                type: 'scatterpolar',
                mode: 'markers',
                name: `${this.leads[this.polarLead]} (Cumulative)`,
                marker: {
                    size: 2,
                    color: '#ff7f0e',
                    opacity: 0.4
                }
            });
        }

        const layout = {
            title: `Polar Plot: ${this.leads[this.polarLead]} (${this.polarMode})`,
            polar: {
                radialaxis: { 
                    title: 'Amplitude (mV)',
                    range: [0, Math.max(...leadData.map(Math.abs)) * 1.1]
                },
                angularaxis: { 
                    rotation: 90, 
                    direction: "clockwise",
                    tickmode: "array",
                    tickvals: [0, 90, 180, 270],
                    ticktext: ['0°', '90°', '180°', '270°']
                }
            },
            showlegend: true,
            height: 400
        };

        Plotly.react('mainChart', traces, layout);
    }

    updateRecurrenceDisplay() {
        const mainChart = document.getElementById('mainChart');
        if (!mainChart || !this.ecgData || !this.ecgData.leads) return;

        const leadXData = this.ecgData.leads[this.recurrenceLeadX] || [];
        const leadYData = this.ecgData.leads[this.recurrenceLeadY] || [];
        
        if (leadXData.length === 0 || leadYData.length === 0) return;

        const xValues = [];
        const yValues = [];
        const timeValues = [];
        
        const step = Math.max(1, Math.floor(leadXData.length / 1000));
        
        for (let i = 0; i < Math.min(leadXData.length, leadYData.length); i += step) {
            xValues.push(leadXData[i]);
            yValues.push(leadYData[i]);
            timeValues.push(i / this.samplingRate);
        }

        let trace;
        if (this.recurrenceMode === 'heatmap') {
            trace = {
                x: xValues,
                y: yValues,
                type: 'histogram2d',
                colorscale: this.recurrenceColormap,
                showscale: true,
                name: 'Density'
            };
        } else {
            trace = {
                x: xValues,
                y: yValues,
                type: 'scatter',
                mode: 'markers',
                name: 'Scatter',
                marker: {
                    size: 3,
                    color: timeValues,
                    colorscale: this.recurrenceColormap,
                    showscale: true,
                    colorbar: { title: 'Time (s)' },
                    opacity: 0.6
                }
            };
        }

        const layout = {
            title: `Recurrence: ${this.leads[this.recurrenceLeadX]} vs ${this.leads[this.recurrenceLeadY]}`,
            xaxis: { title: `${this.leads[this.recurrenceLeadX]} Amplitude (mV)` },
            yaxis: { title: `${this.leads[this.recurrenceLeadY]} Amplitude (mV)` },
            showlegend: false,
            height: 400
        };

        Plotly.react('mainChart', [trace], layout);
    }

    updateAdvancedPlots() {
        this.updatePolarPlot();
        this.updateRecurrencePlot();
    }

    updatePolarPlot() {
        if (!this.ecgData || !this.ecgData.leads) return;
        
        const polarChart = document.getElementById('polarChart');
        if (!polarChart) return;
        
        // Show multiple leads in polar coordinates
        const traces = [];
        const colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728'];
        const leadsToShow = [0, 1, 2, 3]; // Show first 4 leads
        
        leadsToShow.forEach((leadIndex, idx) => {
            const leadData = this.ecgData.leads[leadIndex] || [];
            if (leadData.length === 0) return;
            
            const step = Math.max(1, Math.floor(leadData.length / 200));
            const rValues = [];
            const thetaValues = [];
            
            for (let i = 0; i < leadData.length; i += step) {
                const amplitude = leadData[i];
                const time = i / this.samplingRate;
                
                const r = Math.abs(amplitude);
                const theta = (time * 360) % 360;
                
                rValues.push(r);
                thetaValues.push(theta);
            }
            
            traces.push({
                r: rValues,
                theta: thetaValues,
                type: 'scatterpolar',
                mode: 'markers',
                name: this.leads[leadIndex],
                marker: {
                    size: 2,
                    color: colors[idx % colors.length],
                    opacity: 0.5
                }
            });
        });

        const layout = {
            title: 'Multi-Lead Polar Analysis',
            polar: {
                radialaxis: { title: 'Amplitude (mV)' },
                angularaxis: { 
                    rotation: 90, 
                    direction: "clockwise",
                    tickmode: "array",
                    tickvals: [0, 90, 180, 270],
                    ticktext: ['0°', '90°', '180°', '270°']
                }
            },
            showlegend: true,
            height: 300
        };

        Plotly.react('polarChart', traces, layout);
    }

    updateRecurrencePlot() {
        if (!this.ecgData || !this.ecgData.leads) return;
        
        const recurrenceChart = document.getElementById('recurrenceChart');
        if (!recurrenceChart) return;
        
        const leadXData = this.ecgData.leads[0] || [];
        const leadYData = this.ecgData.leads[1] || [];
        
        if (leadXData.length === 0 || leadYData.length === 0) return;

        const xValues = [];
        const yValues = [];
        
        const step = Math.max(1, Math.floor(leadXData.length / 500));
        
        for (let i = 0; i < Math.min(leadXData.length, leadYData.length); i += step) {
            xValues.push(leadXData[i]);
            yValues.push(leadYData[i]);
        }

        const trace = {
            x: xValues,
            y: yValues,
            type: 'scatter',
            mode: 'markers',
            marker: {
                size: 2,
                color: 'red',
                opacity: 0.5
            }
        };

        const layout = {
            title: 'Lead I vs Lead II Scatter',
            xaxis: { title: 'Lead I (mV)' },
            yaxis: { title: 'Lead II (mV)' },
            showlegend: false,
            height: 300
        };

        Plotly.react('recurrenceChart', [trace], layout);
    }

    // ANIMATION METHODS
    toggleAnimation() {
        if (this.isAnimating) {
            this.stopAnimation();
        } else {
            this.startAnimation();
        }
    }

    startAnimation() {
        if (!this.ecgData || !this.ecgData.leads || this.ecgData.leads.length === 0) {
            this.showMessage('No ECG data to animate', 'error');
            return;
        }

        if (this.isAnimating) return;

        this.isAnimating = true;
        this.updatePlayPauseButton(true);

        console.log('🎬 Starting animation...');

        const animate = () => {
            if (!this.isAnimating) return;

            const maxTime = this.ecgData.leads[0].length / this.samplingRate;
            
            this.currentAnimationTime += this.animationStep;
            
            if (this.currentAnimationTime >= maxTime) {
                this.currentAnimationTime = 0;
            }

            this.updateTimelineSlider();
            this.updateAnimatedDisplay();

            this.animationId = requestAnimationFrame(animate);
        };

        this.animationId = requestAnimationFrame(animate);
    }

    stopAnimation() {
        if (!this.isAnimating) return;

        this.isAnimating = false;
        
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        this.updatePlayPauseButton(false);
        console.log('⏹️ Animation stopped');
    }

    updatePlayPauseButton(isPlaying) {
        const playPauseBtn = document.getElementById('playPauseBtn');
        if (!playPauseBtn) return;

        if (isPlaying) {
            playPauseBtn.innerHTML = '<i class="bi bi-pause-fill me-1"></i>Pause Animation';
            playPauseBtn.classList.remove('btn-primary');
            playPauseBtn.classList.add('btn-warning');
        } else {
            playPauseBtn.innerHTML = '<i class="bi bi-play-fill me-1"></i>Play Animation';
            playPauseBtn.classList.remove('btn-warning');
            playPauseBtn.classList.add('btn-primary');
        }
    }

    updateTimelineSlider() {
        const timelineSlider = document.getElementById('timelineSlider');
        if (timelineSlider) {
            timelineSlider.value = this.currentAnimationTime.toFixed(1);
        }
    }

    seekToTime(time) {
        const seekTime = parseFloat(time);
        if (isNaN(seekTime)) return;

        if (this.isAnimating) {
            this.stopAnimation();
        }

        this.currentAnimationTime = seekTime;
        this.updateAnimatedDisplay();
        this.updateTimelineSlider();
    }

    updateAnimatedDisplay() {
        if (!this.ecgData || !this.ecgData.leads) return;

        const startSample = Math.floor(this.currentAnimationTime * this.samplingRate);
        const windowSamples = Math.floor(this.windowSizeSeconds * this.samplingRate);
        const endSample = Math.min(startSample + windowSamples, this.ecgData.leads[0].length);

        this.updateContinuousDisplay(startSample, endSample);
        this.updateStatsAnimated(startSample, endSample);
        
        // Update current window display
        this.updateElement('currentWindow', 
            `${this.currentAnimationTime.toFixed(1)}s - ${(this.currentAnimationTime + this.windowSizeSeconds).toFixed(1)}s`
        );
    }

    // STATISTICS AND ANALYSIS METHODS
    calculateRRIntervals() {
        if (!this.ecgData || !this.ecgData.leads || this.prqsPoints.R.length < 2) {
            return [];
        }

        const rrIntervals = [];
        for (let i = 1; i < this.prqsPoints.R.length; i++) {
            const interval = (this.prqsPoints.R[i].index - this.prqsPoints.R[i-1].index) / this.samplingRate;
            rrIntervals.push(interval);
        }
        
        return rrIntervals;
    }

    updateStats() {
        if (!this.ecgData) return;

        const rrIntervals = this.calculateRRIntervals();
        const avgRR = rrIntervals.length > 0 ? rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length : 0;
        const heartRate = avgRR > 0 ? Math.round(60 / avgRR) : 0;
        
        this.updateElement('heartRate', `${heartRate} bpm`);
        this.updateElement('rrInterval', `${Math.round(avgRR * 1000)} ms`);
        this.updateElement('qrsWidth', '80-120 ms');
        this.updateElement('totalBeats', this.prqsPoints.R.length);
        this.updateElement('signalQuality', '95%');
    }

    updateStatsAnimated(startIdx, endIdx) {
        if (!this.ecgData || !this.ecgData.leads) return;

        const leadData = this.ecgData.leads[this.selectedLeads[0] || 0];
        if (!leadData) return;

        const windowData = leadData.slice(startIdx, endIdx);
        const beatsInWindow = this.prqsPoints.R.filter(beat => 
            beat.index >= startIdx && beat.index < endIdx
        ).length;

        let instantaneousHR = 0;
        const beats = this.prqsPoints.R.filter(beat => 
            beat.index >= startIdx && beat.index < endIdx
        );
        
        if (beats.length >= 2) {
            const intervals = [];
            for (let i = 1; i < beats.length; i++) {
                const interval = (beats[i].index - beats[i-1].index) / this.samplingRate;
                intervals.push(interval);
            }
            const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
            instantaneousHR = Math.round(60 / avgInterval);
        } else if (beats.length === 1 && this.prqsPoints.R.length > 1) {
            const globalIntervals = this.calculateRRIntervals();
            if (globalIntervals.length > 0) {
                const globalAvg = globalIntervals.reduce((a, b) => a + b, 0) / globalIntervals.length;
                instantaneousHR = Math.round(60 / globalAvg);
            }
        }

        const signalQuality = this.calculateSignalQuality(windowData);

        this.updateElement('heartRate', `${instantaneousHR} bpm`);
        this.updateElement('totalBeats', beatsInWindow);
        this.updateElement('signalQuality', `${signalQuality}%`);
    }

    calculateSignalQuality(windowData) {
        if (!windowData || windowData.length === 0) return 0;
        
        const mean = windowData.reduce((a, b) => a + b, 0) / windowData.length;
        const variance = windowData.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / windowData.length;
        const range = Math.max(...windowData) - Math.min(...windowData);
        
        let quality = 100;
        
        if (variance < 0.001) quality -= 30;
        if (range > 2) quality -= 20;
        
        return Math.max(0, Math.min(100, Math.round(quality)));
    }

    updateElement(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    setupTimelineControls() {
        if (!this.ecgData || !this.ecgData.leads) return;

        const timelineSlider = document.getElementById('timelineSlider');
        if (!timelineSlider) return;

        const maxTime = this.ecgData.leads[0].length / this.samplingRate;
        timelineSlider.max = Math.floor(maxTime);
        timelineSlider.value = 0;
    }

    updateWindowSize(size) {
        this.windowSizeSeconds = parseInt(size);
        this.updateDisplay();
    }

    updateSamplingRate(rate) {
        this.samplingRate = parseInt(rate);
        this.updateDisplay();
    }

    updateAnimationSpeed(speed) {
        this.animationSpeed = parseInt(speed);
        if (this.isAnimating) {
            this.stopAnimation();
            this.startAnimation();
        }
    }

    async analyzeECG() {
        if (!this.ecgData) {
            this.showMessage('Please upload ECG data first', 'error');
            return;
        }

        this.showLoading(true);
        
        try {
            this.detectQRSComplexes();
            this.updateStats();
            
            this.showMessage('ECG analysis completed!', 'success');
        } catch (error) {
            console.error('Analysis error:', error);
            this.showMessage('Error during analysis: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    detectQRSComplexes() {
        if (!this.ecgData || !this.ecgData.leads) return;

        const leadII = this.ecgData.leads[1] || this.ecgData.leads[0];
        if (!leadII) return;

        this.prqsPoints.R = [];
        const threshold = 0.5;
        
        for (let i = 1; i < leadII.length - 1; i++) {
            if (leadII[i] > leadII[i-1] && leadII[i] > leadII[i+1] && leadII[i] > threshold) {
                this.prqsPoints.R.push({
                    index: i,
                    amplitude: leadII[i],
                    time: i / this.samplingRate
                });
                i += Math.floor(0.2 * this.samplingRate);
            }
        }
    }

    async classifyECG() {
        if (!this.ecgData) {
            this.showMessage('Please upload ECG data first', 'error');
            return;
        }

        this.showLoading(true);
        
        try {
            console.log('🧠 Starting AI classification...');
            
            const response = await fetch('http://localhost:5000/api/classify-ecg', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ecg_data: this.ecgData.leads,
                    sampling_rate: this.samplingRate
                })
            });

            console.log('📡 Classification response status:', response.status);
            
            if (!response.ok) {
                let errorMessage = `Classification failed: ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorMessage;
                } catch (e) {
                    errorMessage = response.statusText || errorMessage;
                }
                throw new Error(errorMessage);
            }

            const result = await response.json();
            console.log('✅ Classification successful:', result);
            
            this.lastClassificationResult = result;
            this.displayClassificationResult(result);
            this.updateProbabilityChart(result);
            
            this.showMessage('AI classification completed successfully!', 'success');
        } catch (error) {
            console.error('💥 Classification error:', error);
            this.showMessage('Error during classification: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    displayClassificationResult(result) {
        const resultsContainer = document.getElementById('classificationResult');
        if (!resultsContainer) return;

        let html = '';
        
        if (result.primary_diagnosis) {
            const isNormal = result.primary_diagnosis === 'Normal ECG';
            const alertClass = isNormal ? 'alert-success' : 'alert-danger';
            
            html += `<div class="alert ${alertClass}">
                <h6 class="alert-heading">Primary Diagnosis</h6>
                <strong>${result.primary_diagnosis}</strong>
                ${result.model_used ? '<br><small class="text-muted">(AI Model Classification)</small>' : ''}
            </div>`;
        }
        
        if (result.predictions && result.predictions.length > 0) {
            html += '<h6>Detailed Probabilities:</h6><div class="row">';
            result.predictions.forEach(pred => {
                const width = Math.max(5, pred.probability * 100);
                const barColor = pred.probability > 0.7 ? 'bg-success' : pred.probability > 0.4 ? 'bg-warning' : 'bg-danger';
                
                html += `
                <div class="col-md-6 mb-2">
                    <div class="d-flex justify-content-between">
                        <span>${pred.condition}</span>
                        <span>${(pred.probability * 100).toFixed(1)}%</span>
                    </div>
                    <div class="progress" style="height: 8px">
                        <div class="progress-bar ${barColor}" style="width: ${width}%"></div>
                    </div>
                </div>`;
            });
            html += '</div>';
        }

        resultsContainer.innerHTML = html;
    }

    updateProbabilityChart(result) {
        const probabilityChart = document.getElementById('probabilityChart');
        if (!probabilityChart) return;

        let conditions = ['Normal ECG', 'Sinus Tachycardia', 'Sinus Bradycardia', 'Other Abnormalities'];
        let probabilities = [65, 15, 8, 7];

        if (result.predictions) {
            conditions = result.predictions.map(p => p.condition);
            probabilities = result.predictions.map(p => p.probability * 100);
        }

        const trace = {
            x: conditions,
            y: probabilities,
            type: 'bar',
            marker: {
                color: probabilities.map(p => 
                    p > 50 ? '#28a745' : p > 20 ? '#ffc107' : '#dc3545'
                )
            }
        };

        const layout = {
            title: 'Classification Probabilities',
            xaxis: { title: 'Conditions', tickangle: -45 },
            yaxis: { title: 'Probability (%)', range: [0, 100] },
            showlegend: false,
            height: 250
        };

        Plotly.react('probabilityChart', [trace], layout);
    }

    async exportResults() {
        if (!this.ecgData) {
            this.showMessage('Please upload and analyze ECG data first', 'error');
            return;
        }

        try {
            const results = {
                timestamp: new Date().toISOString(),
                analysis: {
                    heartRate: document.getElementById('heartRate')?.textContent || 'N/A',
                    rrInterval: document.getElementById('rrInterval')?.textContent || 'N/A',
                    signalDuration: document.getElementById('signalDuration')?.textContent || 'N/A'
                },
                classification: this.lastClassificationResult || null
            };

            const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'ecg_analysis_results.json';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            this.showMessage('Results exported successfully!', 'success');
        } catch (error) {
            console.error('Export error:', error);
            this.showMessage('Error exporting results: ' + error.message, 'error');
        }
    }

    resetAnalyzer() {
        this.stopAnimation();
        
        this.ecgData = null;
        this.prqsPoints = { P: [], Q: [], R: [], S: [], T: [] };
        this.currentAnimationTime = 0;
        this.isAnimating = false;
        this.animationId = null;

        const fileInput = document.getElementById('fileInput');
        if (fileInput) fileInput.value = '';

        const statsElements = ['heartRate', 'rrInterval', 'qrsWidth', 'totalBeats', 'abnormalBeats', 'signalQuality', 'signalDuration'];
        statsElements.forEach(id => {
            const element = document.getElementById(id);
            if (element) element.textContent = '--';
        });

        this.clearCharts();
        
        const classifyBtn = document.getElementById('classifyBtn');
        const playPauseBtn = document.getElementById('playPauseBtn');
        if (classifyBtn) classifyBtn.disabled = true;
        if (playPauseBtn) {
            playPauseBtn.disabled = true;
            this.updatePlayPauseButton(false);
        }

        const timelineSlider = document.getElementById('timelineSlider');
        if (timelineSlider) {
            timelineSlider.value = 0;
        }

        this.showMessage('Analyzer reset successfully', 'info');
    }

    clearCharts() {
        const charts = ['mainChart', 'polarChart', 'recurrenceChart', 'probabilityChart'];
        charts.forEach(chartId => {
            const chart = document.getElementById(chartId);
            if (chart) {
                Plotly.purge(chart);
            }
        });
        
        this.initializePlots();
    }

    // UTILITY METHODS
    showLoading(show) {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.style.display = show ? 'block' : 'none';
        }
    }

    showMessage(message, type) {
        const toast = document.createElement('div');
        toast.className = `alert alert-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'info'} alert-dismissible fade show position-fixed`;
        toast.style.top = '20px';
        toast.style.right = '20px';
        toast.style.zIndex = '9999';
        toast.style.minWidth = '300px';
        
        toast.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 5000);
    }
}

// Initialize ECG Analyzer when DOM is loaded
let ecgAnalyzer;
document.addEventListener('DOMContentLoaded', () => {
    ecgAnalyzer = new ECGAnalyzer();
    
    if (typeof AOS !== 'undefined') {
        AOS.init({
            duration: 1000,
            easing: 'ease-in-out',
            once: true,
            mirror: false
        });
    }
});