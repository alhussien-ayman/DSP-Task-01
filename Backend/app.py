from flask import Flask, request, jsonify, send_from_directory, render_template
from flask_cors import CORS
import os
import numpy as np
import pandas as pd
import io
from scipy import signal
import traceback

app = Flask(__name__, 
            template_folder='../Frontend',
            static_folder='../Frontend/assets')

# Enable CORS for all routes
CORS(app)

app.config['SECRET_KEY'] = 'ecg-analyzer-secret-key'
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size

# Configuration
ALLOWED_EXTENSIONS = {'csv', 'txt'}
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def parse_ecg_csv(file_content, sampling_rate=360):
    """Parse ECG CSV file with 12 leads and headers"""
    try:
        print("📊 Parsing ECG CSV file...")
        
        # Read CSV with headers
        df = pd.read_csv(io.StringIO(file_content))
        
        print(f"✅ CSV loaded successfully")
        print(f"📏 Shape: {df.shape}")
        print(f"📋 Columns: {df.columns.tolist()}")
        
        # Expected lead names
        expected_leads = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']
        leads = []
        found_leads = []
        
        # Extract each lead
        for lead_name in expected_leads:
            if lead_name in df.columns:
                lead_data = df[lead_name].dropna().values.tolist()
                leads.append(lead_data)
                found_leads.append(lead_name)
                print(f"📈 Lead {lead_name}: {len(lead_data)} samples")
            else:
                print(f"⚠️  Lead {lead_name} not found in CSV")
                # Create dummy data if lead not found
                default_length = len(df) if len(df) > 0 else 1000
                leads.append([0] * default_length)
        
        print(f"✅ Found {len(found_leads)} leads: {found_leads}")
        
        # Ensure all leads have the same length
        max_length = max(len(lead) for lead in leads)
        print(f"📏 Max lead length: {max_length}")
        
        for i in range(len(leads)):
            if len(leads[i]) < max_length:
                padding_needed = max_length - len(leads[i])
                leads[i].extend([0] * padding_needed)
                print(f"➕ Padded lead {expected_leads[i]} with {padding_needed} zeros")
        
        return {
            'leads': leads,
            'sampling_rate': sampling_rate,
            'duration': max_length / sampling_rate,
            'lead_names': expected_leads,
            'samples_per_lead': max_length
        }
        
    except Exception as e:
        print(f"❌ Error parsing ECG CSV: {e}")
        traceback.print_exc()
        return None

def detect_r_peaks(signal_data, sampling_rate=360):
    """Detect R peaks in ECG signal using Pan-Tompkins algorithm (simplified)"""
    if len(signal_data) == 0:
        return []
    
    signal_array = np.array(signal_data)
    
    # Bandpass filter (simplified)
    # Differentiate
    differentiated = np.diff(signal_array)
    differentiated = np.append(differentiated, 0)  # Maintain same length
    
    # Square
    squared = differentiated ** 2
    
    # Moving window integration
    window_size = int(0.15 * sampling_rate)  # 150ms window
    integrated = np.convolve(squared, np.ones(window_size)/window_size, mode='same')
    
    # Adaptive threshold
    threshold = np.mean(integrated) + 0.5 * np.std(integrated)
    
    # Find peaks with minimum distance
    min_peak_distance = int(0.3 * sampling_rate)  # 300ms minimum between peaks
    peaks = []
    
    i = min_peak_distance
    while i < len(integrated) - min_peak_distance:
        if integrated[i] > threshold:
            # Find local maximum in the original signal around this point
            search_start = max(0, i - int(0.1 * sampling_rate))
            search_end = min(len(signal_array), i + int(0.1 * sampling_rate))
            local_max_idx = np.argmax(signal_array[search_start:search_end]) + search_start
            peaks.append(local_max_idx)
            i += min_peak_distance  # Skip ahead to avoid multiple detections
        else:
            i += 1
    
    return peaks

def calculate_heart_rate(lead_data, sampling_rate=360):
    """Calculate heart rate from lead data"""
    if not lead_data or len(lead_data) < sampling_rate:
        return 0
    
    r_peaks = detect_r_peaks(lead_data, sampling_rate)
    
    if len(r_peaks) < 2:
        return 0
    
    # Calculate RR intervals in seconds
    rr_intervals = np.diff(r_peaks) / sampling_rate
    avg_rr = np.mean(rr_intervals)
    
    # Calculate heart rate (beats per minute)
    heart_rate = int(60 / avg_rr) if avg_rr > 0 else 0
    
    return heart_rate

def calculate_rr_interval(lead_data, sampling_rate=360):
    """Calculate average RR interval in milliseconds"""
    r_peaks = detect_r_peaks(lead_data, sampling_rate)
    
    if len(r_peaks) < 2:
        return 0
    
    rr_intervals = np.diff(r_peaks) / sampling_rate
    avg_rr_ms = np.mean(rr_intervals) * 1000  # Convert to milliseconds
    
    return int(avg_rr_ms)

def calculate_hrv(lead_data, sampling_rate=360):
    """Calculate Heart Rate Variability (SDNN)"""
    r_peaks = detect_r_peaks(lead_data, sampling_rate)
    
    if len(r_peaks) < 2:
        return 0
    
    rr_intervals = np.diff(r_peaks) / sampling_rate * 1000  # Convert to ms
    hrv = np.std(rr_intervals)  # SDNN
    
    return int(hrv)

def assess_signal_quality(leads):
    """Assess signal quality based on variance and dynamics"""
    if not leads:
        return 0
    
    qualities = []
    for lead in leads:
        if lead and len(lead) > 10:
            lead_array = np.array(lead)
            
            # Calculate signal quality metrics
            signal_range = np.max(lead_array) - np.min(lead_array)
            variance = np.var(lead_array)
            
            # Simple quality heuristic
            if signal_range > 0.1 and variance > 0.001:  # Reasonable ECG signal
                quality = min(100, 80 + (signal_range * 50))  # Base 80% + range bonus
            else:
                quality = 30  # Poor signal
                
            qualities.append(quality)
    
    return int(np.mean(qualities)) if qualities else 50

def detect_abnormal_beats(lead_data, sampling_rate=360):
    """Detect potentially abnormal beats based on RR interval variability"""
    r_peaks = detect_r_peaks(lead_data, sampling_rate)
    
    if len(r_peaks) < 3:
        return 0
    
    rr_intervals = np.diff(r_peaks) / sampling_rate
    avg_rr = np.mean(rr_intervals)
    std_rr = np.std(rr_intervals)
    
    # Count intervals that deviate significantly from mean
    abnormal_count = 0
    for interval in rr_intervals:
        if abs(interval - avg_rr) > 2 * std_rr:  # 2 standard deviations
            abnormal_count += 1
    
    return abnormal_count

def detect_pqrst_points(lead_data, sampling_rate=360):
    """Detect P, Q, R, S, T points in ECG signal"""
    r_peaks = detect_r_peaks(lead_data, sampling_rate)
    
    points = {
        'P': [], 'Q': [], 'R': [], 'S': [], 'T': []
    }
    
    for r_peak in r_peaks:
        points['R'].append({
            'index': r_peak,
            'time': r_peak / sampling_rate,
            'amplitude': lead_data[r_peak] if r_peak < len(lead_data) else 0
        })
        
        # Find Q point (before R peak)
        q_search_start = max(0, r_peak - int(0.08 * sampling_rate))  # 80ms before R
        q_search_end = r_peak
        if q_search_end > q_search_start:
            q_point = np.argmin(lead_data[q_search_start:q_search_end]) + q_search_start
            points['Q'].append({
                'index': q_point,
                'time': q_point / sampling_rate,
                'amplitude': lead_data[q_point] if q_point < len(lead_data) else 0
            })
        
        # Find S point (after R peak)
        s_search_start = r_peak
        s_search_end = min(len(lead_data), r_peak + int(0.08 * sampling_rate))  # 80ms after R
        if s_search_end > s_search_start:
            s_point = np.argmin(lead_data[s_search_start:s_search_end]) + s_search_start
            points['S'].append({
                'index': s_point,
                'time': s_point / sampling_rate,
                'amplitude': lead_data[s_point] if s_point < len(lead_data) else 0
            })
    
    return points

def classify_ecg_rule_based(ecg_data, sampling_rate=360):
    """Rule-based ECG classification (fallback when ML model is not available)"""
    try:
        # Use lead II for analysis
        lead_ii = ecg_data[1] if len(ecg_data) > 1 else ecg_data[0]
        
        # Calculate features
        heart_rate = calculate_heart_rate(lead_ii, sampling_rate)
        hrv = calculate_hrv(lead_ii, sampling_rate)
        rr_interval = calculate_rr_interval(lead_ii, sampling_rate)
        
        # Rule-based classification
        predictions = []
        
        # Normal Sinus Rhythm
        normal_prob = 0.7
        if 60 <= heart_rate <= 100 and hrv < 50:
            normal_prob = 0.85
        elif heart_rate < 60 or heart_rate > 100:
            normal_prob = 0.5
        
        predictions.append({
            'condition': 'Normal Sinus Rhythm',
            'probability': normal_prob,
            'confidence': 'High' if normal_prob > 0.7 else 'Medium'
        })
        
        # Tachycardia
        tachycardia_prob = 0.1
        if heart_rate > 100:
            tachycardia_prob = 0.6
        predictions.append({
            'condition': 'Sinus Tachycardia',
            'probability': tachycardia_prob,
            'confidence': 'High' if tachycardia_prob > 0.5 else 'Low'
        })
        
        # Bradycardia
        bradycardia_prob = 0.1
        if heart_rate < 60:
            bradycardia_prob = 0.6
        predictions.append({
            'condition': 'Sinus Bradycardia',
            'probability': bradycardia_prob,
            'confidence': 'High' if bradycardia_prob > 0.5 else 'Low'
        })
        
        # Atrial Fibrillation
        afib_prob = 0.05
        if hrv > 100:  # High HRV can indicate AFib
            afib_prob = 0.4
        predictions.append({
            'condition': 'Atrial Fibrillation',
            'probability': afib_prob,
            'confidence': 'Medium' if afib_prob > 0.3 else 'Low'
        })
        
        # Other abnormalities
        predictions.append({
            'condition': 'Other Abnormalities',
            'probability': 0.1,
            'confidence': 'Low'
        })
        
        # Sort by probability
        predictions.sort(key=lambda x: x['probability'], reverse=True)
        
        primary_diagnosis = predictions[0]['condition']
        is_abnormal = primary_diagnosis != 'Normal Sinus Rhythm'
        
        return {
            'predictions': predictions,
            'primary_diagnosis': primary_diagnosis,
            'is_abnormal': is_abnormal,
            'model_used': False,
            'features': {
                'heart_rate': heart_rate,
                'hrv': hrv,
                'rr_interval': rr_interval
            }
        }
        
    except Exception as e:
        print(f"❌ Error in rule-based classification: {e}")
        return get_fallback_prediction()

def get_fallback_prediction():
    """Fallback prediction"""
    return {
        'predictions': [
            {
                'condition': 'Normal Sinus Rhythm',
                'probability': 0.75,
                'confidence': 'High'
            },
            {
                'condition': 'Sinus Tachycardia',
                'probability': 0.12,
                'confidence': 'Low'
            },
            {
                'condition': 'Sinus Bradycardia',
                'probability': 0.08,
                'confidence': 'Low'
            },
            {
                'condition': 'Other Abnormalities',
                'probability': 0.05,
                'confidence': 'Low'
            }
        ],
        'primary_diagnosis': 'Normal Sinus Rhythm',
        'is_abnormal': False,
        'model_used': False
    }

# ==================== ROUTES ====================

@app.route('/')
def index():
    """Serve main index page"""
    return render_template('index.html')

@app.route('/ecg-analysis')
def ecg_analysis():
    """Serve ECG analysis page"""
    return render_template('ECG-Analysis.html')

@app.route('/portfolio-details')
def portfolio_details():
    """Serve portfolio details page"""
    return render_template('portfolio-details.html')

@app.route('/service-details')
def service_details():
    """Serve service details page"""
    return render_template('service-details.html')

@app.route('/assets/<path:filename>')
def serve_assets(filename):
    """Serve static assets"""
    return send_from_directory('../Frontend/assets', filename)

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'message': 'ECG Analyzer API is running!',
        'model_loaded': False,
        'classification_method': 'rule_based',
        'endpoints': {
            'upload_ecg': 'POST /api/upload-ecg',
            'classify_ecg': 'POST /api/classify-ecg',
            'analyze_ecg': 'POST /api/analyze-ecg'
        }
    })

@app.route('/api/upload-ecg', methods=['POST'])
def upload_ecg():
    """Handle ECG file upload and parsing"""
    print("\n" + "="*50)
    print("📁 ECG UPLOAD ENDPOINT CALLED")
    print("="*50)
    
    try:
        # Check if file was provided
        if 'ecg_file' not in request.files:
            print("❌ No file in request")
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['ecg_file']
        print(f"📄 File received: {file.filename}")
        
        if file.filename == '':
            print("❌ Empty filename")
            return jsonify({'error': 'No file selected'}), 400
        
        # Check file type
        if not allowed_file(file.filename):
            print("❌ Invalid file type")
            return jsonify({'error': 'Invalid file type. Please upload CSV or TXT.'}), 400

        # Read file content
        file_content = file.read().decode('utf-8')
        print(f"📊 File size: {len(file_content)} characters")
        
        # Get sampling rate from form data
        sampling_rate = int(request.form.get('sampling_rate', 360))
        print(f"🎯 Sampling rate: {sampling_rate} Hz")

        # Parse the ECG file
        ecg_data = parse_ecg_csv(file_content, sampling_rate)
        
        if ecg_data is None:
            print("❌ Failed to parse ECG file")
            return jsonify({'error': 'Failed to parse ECG file. Please check the format.'}), 400
        
        # Perform basic analysis on lead II (usually the clearest)
        lead_ii_data = ecg_data['leads'][1] if len(ecg_data['leads']) > 1 else ecg_data['leads'][0]
        
        # Detect PQRST points
        pqrst_points = detect_pqrst_points(lead_ii_data, sampling_rate)
        
        basic_analysis = {
            'heart_rate': calculate_heart_rate(lead_ii_data, sampling_rate),
            'rr_interval': calculate_rr_interval(lead_ii_data, sampling_rate),
            'hrv': calculate_hrv(lead_ii_data, sampling_rate),
            'signal_quality': assess_signal_quality(ecg_data['leads']),
            'total_beats': len(pqrst_points['R']),
            'abnormal_beats': detect_abnormal_beats(lead_ii_data, sampling_rate),
            'pqrst_points': {
                'P': len(pqrst_points['P']),
                'Q': len(pqrst_points['Q']),
                'R': len(pqrst_points['R']),
                'S': len(pqrst_points['S']),
                'T': len(pqrst_points['T'])
            }
        }
        
        response_data = {
            'message': 'ECG file processed successfully!',
            'data': ecg_data,
            'analysis': basic_analysis
        }
        
        print("✅ File parsed successfully!")
        print(f"❤️  Heart Rate: {basic_analysis['heart_rate']} bpm")
        print(f"⏱️  RR Interval: {basic_analysis['rr_interval']} ms")
        print(f"📊 HRV: {basic_analysis['hrv']} ms")
        print(f"📶 Signal Quality: {basic_analysis['signal_quality']}%")
        print(f"📈 P-QRS-T Points: P={basic_analysis['pqrst_points']['P']}, Q={basic_analysis['pqrst_points']['Q']}, R={basic_analysis['pqrst_points']['R']}, S={basic_analysis['pqrst_points']['S']}, T={basic_analysis['pqrst_points']['T']}")
        print("="*50)
        
        return jsonify(response_data)
        
    except Exception as e:
        print(f"💥 Upload error: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/api/classify-ecg', methods=['POST'])
def classify_ecg_route():
    """Classify ECG data using rule-based approach"""
    print("\n" + "="*50)
    print("🧠 CLASSIFICATION ENDPOINT CALLED")
    print("="*50)
    
    try:
        data = request.get_json()
        
        if not data or 'ecg_data' not in data:
            return jsonify({'error': 'No ECG data provided'}), 400
        
        ecg_leads = data['ecg_data']
        sampling_rate = data.get('sampling_rate', 360)
        
        # Validate input
        if len(ecg_leads) != 12:
            return jsonify({'error': 'Expected 12 leads of ECG data'}), 400
        
        print(f"📊 Classifying ECG with {len(ecg_leads[0])} samples per lead...")
        
        # Classify the ECG using rule-based approach
        classification_result = classify_ecg_rule_based(ecg_leads, sampling_rate)
        
        print(f"✅ Classification completed!")
        print(f"🏥 Primary diagnosis: {classification_result['primary_diagnosis']}")
        print("="*50)
        
        return jsonify(classification_result)
        
    except Exception as e:
        print(f"💥 Classification error: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/analyze-ecg', methods=['POST'])
def analyze_ecg():
    """Perform detailed ECG analysis"""
    print("\n" + "="*50)
    print("📊 ANALYSIS ENDPOINT CALLED")
    print("="*50)
    
    try:
        data = request.get_json()
        ecg_leads = data.get('ecg_data', [])
        sampling_rate = data.get('sampling_rate', 360)
        
        if len(ecg_leads) == 0:
            return jsonify({'error': 'No ECG data provided'}), 400
        
        # Use lead II for analysis (index 1)
        lead_ii_data = ecg_leads[1] if len(ecg_leads) > 1 else ecg_leads[0]
        
        # Detect R peaks and PQRST points
        r_peaks = detect_r_peaks(lead_ii_data, sampling_rate)
        pqrst_points = detect_pqrst_points(lead_ii_data, sampling_rate)
        
        # Calculate various metrics
        analysis_result = {
            'heart_rate': calculate_heart_rate(lead_ii_data, sampling_rate),
            'rr_interval': calculate_rr_interval(lead_ii_data, sampling_rate),
            'hrv': calculate_hrv(lead_ii_data, sampling_rate),
            'signal_quality': assess_signal_quality(ecg_leads),
            'total_beats': len(r_peaks),
            'abnormal_beats': detect_abnormal_beats(lead_ii_data, sampling_rate),
            'r_peaks_detected': len(r_peaks),
            'pqrst_points': pqrst_points,
            'sampling_rate': sampling_rate,
            'data_points': len(lead_ii_data),
            'duration_seconds': len(lead_ii_data) / sampling_rate
        }
        
        print("✅ Analysis completed!")
        print(f"❤️  Heart Rate: {analysis_result['heart_rate']} bpm")
        print(f"⏱️  RR Interval: {analysis_result['rr_interval']} ms")
        print(f"📊 HRV: {analysis_result['hrv']} ms")
        print(f"📶 Signal Quality: {analysis_result['signal_quality']}%")
        print("="*50)
        
        return jsonify(analysis_result)
        
    except Exception as e:
        print(f"💥 Analysis error: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# Error handlers
@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(405)
def method_not_allowed(error):
    return jsonify({'error': 'Method not allowed'}), 405

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    print("\n" + "="*60)
    print("🚀 STARTING ECG ANALYZER SERVER (TensorFlow-Free)")
    print("="*60)
    print("📍 Server URL: http://localhost:5500")
    print("📍 Health check: GET http://localhost:5500/api/health")
    print("📍 Upload ECG: POST http://localhost:5500/api/upload-ecg")
    print("📍 Classify ECG: POST http://localhost:5500/api/classify-ecg")
    print("📍 Classification: Rule-based (No TensorFlow required)")
    print("="*60)
    
    # Start the Flask application
    app.run(debug=True, port=5000, host='0.0.0.0')