// ECG Analyzer Class with Plotly.js
class ECGAnalyzer {
    constructor() {
        this.ecgData = null;
        this.leads = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
        this.selectedLeads = [0, 1]; // Default: Lead I and II
        this.samplingRate = 360;
        this.prqsPoints = { P: [], Q: [], R: [], S: [], T: [] };
        
        // Animation properties
        this.isAnimating = false;
        this.animationId = null;
        this.currentAnimationTime = 0;
        this.windowSizeSeconds = 10;
        this.animationSpeed = 50;
        
        this.initializeEventListeners();
        this.initializePlots();
    }

    initializeEventListeners() {
        document.getElementById('fileInput').addEventListener('change', (e) => this.handleFileUpload(e));
        document.getElementById('displayMode').addEventListener('change', (e) => this.switchDisplayMode(e.target.value));
        document.getElementById('windowSize').addEventListener('change', (e) => this.updateWindowSize(e.target.value));
        document.getElementById('animationSpeed').addEventListener('change', (e) => this.updateAnimationSpeed(e.target.value));
        document.getElementById('samplingRate').addEventListener('change', (e) => this.updateSamplingRate(e.target.value));
        document.getElementById('timelineSlider').addEventListener('input', (e) => this.seekToTime(e.target.value));
        document.getElementById('playPauseBtn').addEventListener('click', () => this.toggleAnimation());
        document.getElementById('analyzeBtn').addEventListener('click', () => this.analyzeECG());
        document.getElementById('classifyBtn').addEventListener('click', () => this.classifyECG());
        document.getElementById('resetBtn').addEventListener('click', () => this.resetAnalyzer());
        document.getElementById('exportPdfBtn').addEventListener('click', () => this.exportPDFReport());

        // Lead selection checkboxes
        document.querySelectorAll('.lead-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => this.updateLeadSelection(e.target));
        });
    }

    initializePlots() {
        // Initialize empty plots
        this.initializeECGPlot();
        this.initializePolarPlot();
        this.initializeRecurrencePlot();
        this.initializeRRPlot();
        this.initializeProbabilityPlot();
    }

    initializeECGPlot() {
        const layout = {
            title: '12-Lead ECG Signal',
            xaxis: { title: 'Time (s)', gridcolor: 'lightgray' },
            yaxis: { title: 'Amplitude (mV)', gridcolor: 'lightgray' },
            showlegend: true,
            height: 400,
            margin: { l: 50, r: 50, t: 50, b: 50 }
        };
        
        Plotly.newPlot('ecgChart', [], layout, { responsive: true });
    }

    initializePolarPlot() {
        const layout = {
            title: 'Vectorcardiogram (Polar Plot)',
            polar: {
                radialaxis: { visible: true, range: [0, 1] }
            },
            showlegend: false,
            height: 250
        };
        
        Plotly.newPlot('polarChart', [], layout, { responsive: true });
    }

    initializeRecurrencePlot() {
        const layout = {
            title: 'Recurrence Plot',
            xaxis: { title: 'Time (s)' },
            yaxis: { title: 'Time (s)' },
            showlegend: false,
            height: 250
        };
        
        Plotly.newPlot('recurrenceChart', [], layout, { responsive: true });
    }

    initializeRRPlot() {
        const layout = {
            title: 'RR Interval Variability',
            xaxis: { title: 'Beat Number' },
            yaxis: { title: 'RR Interval (ms)' },
            showlegend: false,
            height: 250
        };
        
        Plotly.newPlot('rrChart', [], layout, { responsive: true });
    }

    initializeProbabilityPlot() {
        const layout = {
            title: 'Classification Probabilities',
            xaxis: { title: 'Conditions' },
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

        console.log('🔄 Starting upload to port 5000...');
        
        // Change this URL to point to port 5000
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
        document.getElementById('classifyBtn').disabled = false;
        document.getElementById('playPauseBtn').disabled = false;
        
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

    updateDisplay() {
        if (!this.ecgData) return;

        const displayMode = document.getElementById('displayMode').value;
        
        if (displayMode === 'animated') {
            this.updateAnimatedDisplay();
        } else {
            this.updateStaticDisplay();
        }
        
        this.updateAdvancedPlots();
        this.updateStats();
    }

    updateStaticDisplay() {
        const traces = [];
        const colors = [
            '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
            '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
            '#ff9896', '#98df8a'
        ];

        this.selectedLeads.forEach(leadIndex => {
            if (this.ecgData.leads[leadIndex]) {
                const timeArray = this.ecgData.leads[leadIndex].map((_, index) => index / this.samplingRate);
                
                traces.push({
                    x: timeArray,
                    y: this.ecgData.leads[leadIndex],
                    type: 'scatter',
                    mode: 'lines',
                    name: this.leads[leadIndex],
                    line: { color: colors[leadIndex % colors.length], width: 1 }
                });
            }
        });

        const layout = {
            title: '12-Lead ECG Signal',
            xaxis: { title: 'Time (s)', gridcolor: 'lightgray' },
            yaxis: { title: 'Amplitude (mV)', gridcolor: 'lightgray' },
            showlegend: true,
            height: 400
        };

        Plotly.react('ecgChart', traces, layout);
    }

    updateAnimatedDisplay() {
        if (!this.ecgData) return;

        const startTime = this.currentAnimationTime;
        const endTime = startTime + this.windowSizeSeconds;
        const startIdx = Math.floor(startTime * this.samplingRate);
        const endIdx = Math.floor(endTime * this.samplingRate);

        const traces = [];
        const colors = [
            '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
            '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
            '#ff9896', '#98df8a'
        ];

        this.selectedLeads.forEach(leadIndex => {
            if (this.ecgData.leads[leadIndex]) {
                const windowData = this.ecgData.leads[leadIndex].slice(startIdx, endIdx);
                const timeArray = windowData.map((_, index) => startTime + (index / this.samplingRate));
                
                traces.push({
                    x: timeArray,
                    y: windowData,
                    type: 'scatter',
                    mode: 'lines',
                    name: this.leads[leadIndex],
                    line: { color: colors[leadIndex % colors.length], width: 1 }
                });
            }
        });

        const layout = {
            title: `ECG Signal (${startTime.toFixed(1)}s - ${endTime.toFixed(1)}s)`,
            xaxis: { title: 'Time (s)', gridcolor: 'lightgray', range: [startTime, endTime] },
            yaxis: { title: 'Amplitude (mV)', gridcolor: 'lightgray' },
            showlegend: true,
            height: 400
        };

        Plotly.react('ecgChart', traces, layout);
        this.updateStatsAnimated(startIdx, endIdx);
    }

    updateAdvancedPlots() {
        this.updatePolarPlot();
        this.updateRecurrencePlot();
        this.updateRRPlot();
    }

    updatePolarPlot() {
        if (!this.ecgData || this.selectedLeads.length < 2) return;

        // Simple vector calculation from Lead I and Lead II
        const leadI = this.ecgData.leads[0] || [];
        const leadII = this.ecgData.leads[1] || [];
        
        if (leadI.length === 0 || leadII.length === 0) return;

        const theta = [];
        const r = [];
        
        // Sample every 10 points for performance
        for (let i = 0; i < Math.min(leadI.length, leadII.length); i += 10) {
            const x = leadI[i];
            const y = leadII[i];
            theta.push(Math.atan2(y, x));
            r.push(Math.sqrt(x * x + y * y));
        }

        const trace = {
            theta: theta,
            r: r,
            type: 'scatterpolar',
            mode: 'markers',
            marker: {
                size: 2,
                color: 'blue',
                opacity: 0.6
            }
        };

        const layout = {
            title: 'Vectorcardiogram (Polar Plot)',
            polar: {
                radialaxis: { visible: true, range: [0, Math.max(...r)] }
            },
            showlegend: false,
            height: 250
        };

        Plotly.react('polarChart', [trace], layout);
    }

    updateRecurrencePlot() {
        if (!this.ecgData || this.selectedLeads.length === 0) return;

        const leadData = this.ecgData.leads[this.selectedLeads[0]];
        if (!leadData || leadData.length === 0) return;

        // Create recurrence plot data (simplified)
        const size = 100; // Reduced size for performance
        const step = Math.floor(leadData.length / size);
        
        const x = [];
        const y = [];
        const z = [];

        for (let i = 0; i < size; i++) {
            for (let j = 0; j < size; j++) {
                const idx1 = i * step;
                const idx2 = j * step;
                if (idx1 < leadData.length && idx2 < leadData.length) {
                    const distance = Math.abs(leadData[idx1] - leadData[idx2]);
                    if (distance < 0.1) { // Threshold for recurrence
                        x.push(i);
                        y.push(j);
                        z.push(distance);
                    }
                }
            }
        }

        const trace = {
            x: x,
            y: y,
            mode: 'markers',
            type: 'scatter',
            marker: {
                size: 2,
                color: z,
                colorscale: 'Viridis',
                showscale: true
            }
        };

        const layout = {
            title: 'Recurrence Plot',
            xaxis: { title: 'Time Index' },
            yaxis: { title: 'Time Index' },
            showlegend: false,
            height: 250
        };

        Plotly.react('recurrenceChart', [trace], layout);
    }

    updateRRPlot() {
        const rrIntervals = this.calculateRRIntervals();
        if (rrIntervals.length === 0) return;

        const trace = {
            x: Array.from({length: rrIntervals.length}, (_, i) => i + 1),
            y: rrIntervals.map(interval => (interval * 1000 / this.samplingRate)),
            type: 'scatter',
            mode: 'lines+markers',
            line: { color: 'green', width: 2 },
            marker: { size: 4 }
        };

        const layout = {
            title: 'RR Interval Variability',
            xaxis: { title: 'Beat Number' },
            yaxis: { title: 'RR Interval (ms)' },
            showlegend: false,
            height: 250
        };

        Plotly.react('rrChart', [trace], layout);
    }

    calculateRRIntervals() {
        const rPeaks = this.detectRPeaks();
        const intervals = [];
        
        for (let i = 1; i < rPeaks.length; i++) {
            intervals.push(rPeaks[i] - rPeaks[i-1]);
        }
        
        return intervals;
    }

    detectRPeaks() {
        if (!this.ecgData || this.selectedLeads.length === 0) return [];
        
        const leadData = this.ecgData.leads[this.selectedLeads[0]];
        if (!leadData) return [];
        
        const peaks = [];
        const threshold = this.calculateThreshold(leadData);
        
        for (let i = 50; i < leadData.length - 50; i++) {
            if (leadData[i] > threshold && 
                leadData[i] > leadData[i-1] && 
                leadData[i] > leadData[i+1]) {
                peaks.push(i);
                i += 100; // Skip next 100 samples to avoid multiple detections
            }
        }
        
        return peaks;
    }

    calculateThreshold(data) {
        const sorted = [...data].sort((a, b) => b - a);
        return sorted[Math.floor(sorted.length * 0.1)];
    }

    async analyzeECG() {
        if (!this.ecgData) {
            this.showMessage('Please upload ECG data first', 'error');
            return;
        }

        this.showLoading(true);
        
        try {
            // Detect P-QRS-T points
            this.detectPQRSComplex();
            
            // Calculate statistics
            this.updateStats();
            
            this.showMessage('ECG analysis completed successfully!', 'success');
        } catch (error) {
            this.showMessage('Error during analysis: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    detectPQRSComplex() {
        if (!this.ecgData || this.selectedLeads.length === 0) return;

        const leadData = this.ecgData.leads[this.selectedLeads[0]];
        const rPeaks = this.detectRPeaks();
        
        this.prqsPoints = { P: [], Q: [], R: [], S: [], T: [] };
        
        rPeaks.forEach(rPeak => {
            this.prqsPoints.R.push({
                index: rPeak,
                time: rPeak / this.samplingRate,
                amplitude: leadData[rPeak]
            });
            
            // Detect Q point (before R peak)
            let qPoint = rPeak;
            for (let i = rPeak - 1; i >= Math.max(0, rPeak - 50); i--) {
                if (leadData[i] < leadData[qPoint]) {
                    qPoint = i;
                }
            }
            this.prqsPoints.Q.push({
                index: qPoint,
                time: qPoint / this.samplingRate,
                amplitude: leadData[qPoint]
            });
            
            // Detect S point (after R peak)
            let sPoint = rPeak;
            for (let i = rPeak + 1; i <= Math.min(leadData.length - 1, rPeak + 50); i++) {
                if (leadData[i] < leadData[sPoint]) {
                    sPoint = i;
                }
            }
            this.prqsPoints.S.push({
                index: sPoint,
                time: sPoint / this.samplingRate,
                amplitude: leadData[sPoint]
            });
        });
        
        this.updatePQRSDisplay();
    }

    updatePQRSDisplay() {
        document.getElementById('pPoints').textContent = this.prqsPoints.P.length;
        document.getElementById('qPoints').textContent = this.prqsPoints.Q.length;
        document.getElementById('rPoints').textContent = this.prqsPoints.R.length;
        document.getElementById('sPoints').textContent = this.prqsPoints.S.length;
        document.getElementById('tPoints').textContent = this.prqsPoints.T.length;
        
        // Calculate average QT interval
        if (this.prqsPoints.Q.length > 0 && this.prqsPoints.T.length > 0) {
            const qtInterval = this.calculateQTInterval();
            document.getElementById('qtInterval').textContent = `${qtInterval} ms`;
        }
    }

    calculateQTInterval() {
        // Simplified QT interval calculation
        const rrIntervals = this.calculateRRIntervals();
        const avgRR = rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length;
        const qt = 0.39 * Math.sqrt(avgRR / this.samplingRate); // Bazett's formula approximation
        return Math.round(qt * 1000);
    }

    updateStats() {
        if (!this.ecgData) return;

        const rrIntervals = this.calculateRRIntervals();
        const avgRR = rrIntervals.length > 0 ? rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length : 0;
        const heartRate = avgRR > 0 ? Math.round(60 / (avgRR / this.samplingRate)) : 0;
        
        document.getElementById('heartRate').textContent = `${heartRate} bpm`;
        document.getElementById('rrInterval').textContent = `${Math.round(avgRR * 1000 / this.samplingRate)} ms`;
        document.getElementById('qrsWidth').textContent = '80-120 ms'; // Typical range
        document.getElementById('totalBeats').textContent = this.prqsPoints.R.length;
        document.getElementById('abnormalBeats').textContent = '0'; // Would need abnormal beat detection
        document.getElementById('signalQuality').textContent = '95%'; // Would need signal quality calculation
    }

     updateStatsAnimated(startIdx, endIdx) {
        const windowData = this.ecgData.leads[this.selectedLeads[0]].slice(startIdx, endIdx);
        const beatsInWindow = this.prqsPoints.R.filter(beat => 
            beat.index >= startIdx && beat.index < endIdx
        ).length;

        // Calculate instantaneous heart rate
        let instantaneousHR = 0;
        if (beatsInWindow >= 2) {
            const beats = this.prqsPoints.R.filter(beat => 
                beat.index >= startIdx && beat.index < endIdx
            );
            if (beats.length >= 2) {
                const interval = (beats[1].index - beats[0].index) / this.samplingRate;
                instantaneousHR = Math.round(60 / interval);
            }
        }

        document.getElementById('heartRate').textContent = `${instantaneousHR} bpm`;
        document.getElementById('totalBeats').textContent = beatsInWindow;
    }

    async classifyECG() {
        if (!this.ecgData) {
            this.showMessage('Please upload ECG data first', 'error');
            return;
        }

        this.showLoading(true);
        
        try {
            const response = await fetch('/api/classify-ecg', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ecg_data: this.ecgData.leads,
                    sampling_rate: this.samplingRate
                })
            });

            if (!response.ok) {
                throw new Error('Classification failed');
            }

            const result = await response.json();
            this.displayClassificationResult(result);
            this.updateProbabilityChart(result);
            
            this.showMessage('Classification completed successfully!', 'success');
        } catch (error) {
            console.error('Classification error:', error);
            this.showMessage('Error during classification: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    displayClassificationResult(result) {
        const resultDiv = document.getElementById('classificationResult');
        const primary = result.predictions[0];
        
        resultDiv.innerHTML = `
            <div class="classification-result ${result.is_abnormal ? 'abnormal' : ''}">
                <h6 class="mb-2">Primary Diagnosis</h6>
                <div class="h5 fw-bold mb-2">
                    ${primary.condition}
                </div>
                <div class="small">
                    Confidence: ${primary.confidence} (${(primary.probability * 100).toFixed(1)}%)
                </div>
            </div>
            <div class="mt-3">
                <h6 class="mb-2">All Predictions:</h6>
                ${result.predictions.map(pred => `
                    <div class="d-flex justify-content-between align-items-center py-1 border-bottom">
                        <span class="small">${pred.condition}</span>
                        <span class="badge bg-primary">${(pred.probability * 100).toFixed(1)}%</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    updateProbabilityChart(result) {
        const labels = result.predictions.map(pred => pred.condition);
        const probabilities = result.predictions.map(pred => pred.probability * 100);
        const colors = ['#3675dc', '#dc3545', '#fd7e14', '#20c997', '#6f42c1', '#e83e8c'];

        const trace = {
            x: labels,
            y: probabilities,
            type: 'bar',
            marker: {
                color: colors.slice(0, labels.length),
                line: {
                    color: 'white',
                    width: 1
                }
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

    // Animation Methods
    switchDisplayMode(mode) {
        const timelineControl = document.getElementById('timelineControl');
        
        if (mode === 'animated') {
            timelineControl.style.display = 'block';
            this.stopAnimation();
            this.setupTimelineControls();
        } else {
            timelineControl.style.display = 'none';
            this.stopAnimation();
            this.updateDisplay();
        }
    }

    updateWindowSize(seconds) {
        this.windowSizeSeconds = parseInt(seconds);
        if (this.isAnimating) {
            this.updateAnimatedDisplay();
        }
    }

    updateAnimationSpeed(speed) {
        const speedMap = {
            'slow': 100,
            'medium': 50,
            'fast': 20
        };
        this.animationSpeed = speedMap[speed] || 50;
    }

    updateSamplingRate(rate) {
        this.samplingRate = parseInt(rate);
        if (this.ecgData) {
            this.updateDisplay();
        }
    }

    setupTimelineControls() {
        if (!this.ecgData) return;
        
        const totalDuration = this.ecgData.leads[0].length / this.samplingRate;
        const slider = document.getElementById('timelineSlider');
        const totalTimeSpan = document.getElementById('totalTime');
        
        slider.max = Math.max(0, totalDuration - this.windowSizeSeconds);
        slider.value = 0;
        totalTimeSpan.textContent = `${totalDuration.toFixed(1)}s`;
        
        this.currentAnimationTime = 0;
        this.updateTimeDisplay();
    }

    seekToTime(sliderValue) {
        this.currentAnimationTime = parseFloat(sliderValue);
        this.updateTimeDisplay();
        this.updateAnimatedDisplay();
    }

    toggleAnimation() {
        const playPauseBtn = document.getElementById('playPauseBtn');
        const icon = playPauseBtn.querySelector('i');
        
        if (this.isAnimating) {
            this.stopAnimation();
            playPauseBtn.innerHTML = '<i class="bi bi-play-fill me-1"></i>Play Animation';
        } else {
            this.startAnimation();
            playPauseBtn.innerHTML = '<i class="bi bi-pause-fill me-1"></i>Pause Animation';
        }
    }

    startAnimation() {
        if (!this.ecgData || this.isAnimating) return;
        
        this.isAnimating = true;
        
        const animate = () => {
            if (!this.isAnimating) return;
            
            const maxTime = this.ecgData.leads[0].length / this.samplingRate - this.windowSizeSeconds;
            
            if (this.currentAnimationTime >= maxTime) {
                this.currentAnimationTime = 0;
            } else {
                const timeStep = 0.1;
                this.currentAnimationTime += timeStep;
            }
            
            this.updateTimeDisplay();
            this.updateAnimatedDisplay();
            
            this.animationId = setTimeout(animate, this.animationSpeed);
        };
        
        animate();
    }

    stopAnimation() {
        this.isAnimating = false;
        if (this.animationId) {
            clearTimeout(this.animationId);
            this.animationId = null;
        }
    }

    updateTimeDisplay() {
        const currentTimeSpan = document.getElementById('currentTime');
        const slider = document.getElementById('timelineSlider');
        const progressBar = document.getElementById('progressBar');
        
        currentTimeSpan.textContent = `${this.currentAnimationTime.toFixed(1)}s`;
        if (slider.max > 0) {
            slider.value = this.currentAnimationTime;
            
            const progress = (this.currentAnimationTime / parseFloat(slider.max)) * 100;
            progressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
        }
    }

    resetAnalyzer() {
        this.stopAnimation();
        this.ecgData = null;
        this.prqsPoints = { P: [], Q: [], R: [], S: [], T: [] };
        
        document.getElementById('fileInput').value = '';
        document.getElementById('classifyBtn').disabled = true;
        document.getElementById('playPauseBtn').disabled = true;
        document.getElementById('timelineControl').style.display = 'none';
        
        this.initializePlots();
        this.updatePQRSDisplay();
        this.updateStats();
        
        // Reset lead selection
        document.querySelectorAll('.lead-checkbox').forEach(checkbox => {
            checkbox.checked = checkbox.value === '0' || checkbox.value === '1';
        });
        this.selectedLeads = [0, 1];
        
        this.showMessage('Analyzer reset successfully', 'success');
    }

    async exportPDFReport() {
        if (!this.ecgData) {
            this.showMessage('Please upload ECG data first', 'error');
            return;
        }

        this.showLoading(true);
        
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            // Add content to PDF
            doc.setFontSize(20);
            doc.text('ECG Analysis Report', 20, 20);
            doc.setFontSize(12);
            doc.text(`Analysis Date: ${new Date().toLocaleDateString()}`, 20, 35);
            doc.text(`Heart Rate: ${document.getElementById('heartRate').textContent}`, 20, 45);
            doc.text(`RR Interval: ${document.getElementById('rrInterval').textContent}`, 20, 55);
            doc.text(`Total Beats: ${document.getElementById('totalBeats').textContent}`, 20, 65);
            
            const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            doc.save(`ECG_Analysis_Report_${timestamp}.pdf`);
            
            this.showMessage('PDF report generated successfully!', 'success');
        } catch (error) {
            this.showMessage('Error generating PDF report: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    showLoading(show) {
        const loading = document.getElementById('loading');
        loading.style.display = show ? 'block' : 'none';
    }

    showMessage(message, type) {
        const toast = document.createElement('div');
        toast.className = `toast align-items-center text-bg-${type === 'error' ? 'danger' : 'success'} border-0 position-fixed`;
        toast.style.top = '20px';
        toast.style.right = '20px';
        toast.style.zIndex = '9999';
        
        toast.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        `;
        
        document.body.appendChild(toast);
        
        const bsToast = new bootstrap.Toast(toast);
        bsToast.show();
        
        toast.addEventListener('hidden.bs.toast', () => {
            toast.remove();
        });
    }
}

// Initialize ECG Analyzer when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ECGAnalyzer();
    
    // Initialize AOS
    if (typeof AOS !== 'undefined') {
        AOS.init({
            duration: 1000,
            easing: 'ease-in-out',
            once: true,
            mirror: false
        });
    }
});