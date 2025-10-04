from flask import Flask, request, jsonify, send_from_directory, render_template
from flask_cors import CORS
import os
import numpy as np
import pandas as pd
import io
from scipy import signal
import traceback
import subprocess
import json
import tempfile

app = Flask(__name__, 
            template_folder='../Frontend',
            static_folder='../Frontend/assets')

# Enable CORS for all routes
CORS(app)

app.config['SECRET_KEY'] = 'ecg-analyzer-secret-key'
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024

# Configuration
ALLOWED_EXTENSIONS = {'csv', 'txt'}
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Model configuration
MODEL_LABELS = ["1dAVb", "RBBB", "LBBB", "SB", "AF", "ST"]
MODEL_RUNNER_SCRIPT = "model_runner.py"

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def parse_ecg_csv(file_content, sampling_rate=360):
    """Parse ECG CSV file with 12 leads and headers"""
    try:
        print("📊 Parsing ECG CSV file...")
        
        # Read CSV with headers
        df = pd.read_csv(io.StringIO(file_content))
        
        print(f"✅ CSV loaded successfully")
        print(f"📏 Shape: {df.shape}")
        print(f"📋 Columns: {df.columns.tolist()}")
        
        # Normalize column names (uppercase, remove spaces)
        df.columns = [c.strip().upper() for c in df.columns]
        
        # Expected 12 leads (model order)
        expected_leads = ["I", "II", "III", "AVR", "AVL", "AVF", "V1", "V2", "V3", "V4", "V5", "V6"]
        
        # Keep only first 12 leads if file has extra columns
        available_leads = [c for c in df.columns if c in expected_leads]
        df = df[available_leads]
        
        # Ensure all expected leads exist (fill missing with zeros)
        for lead in expected_leads:
            if lead not in df.columns:
                df[lead] = 0.0
                print(f"⚠️  Lead {lead} not found, filled with zeros")

        # Reorder to model order
        df = df[expected_leads]

        # Convert to list format for frontend
        leads = []
        for lead_name in expected_leads:
            lead_data = df[lead_name].dropna().values.tolist()
            leads.append(lead_data)
            print(f"📈 Lead {lead_name}: {len(lead_data)} samples")
        
        # Ensure all leads have the same length
        max_length = max(len(lead) for lead in leads)
        print(f"📏 Max lead length: {max_length}")
        
        for i in range(len(leads)):
            if len(leads[i]) < max_length:
                padding_needed = max_length - len(leads[i])
                leads[i].extend([0] * padding_needed)
        
        return {
            'leads': leads,
            'sampling_rate': sampling_rate,
            'duration': max_length / sampling_rate,
            'lead_names': expected_leads,
            'samples_per_lead': max_length,
            'dataframe': df.to_dict()  # Keep dataframe for model processing
        }
        
    except Exception as e:
        print(f"❌ Error parsing ECG CSV: {e}")
        traceback.print_exc()
        return None

def run_model_prediction(csv_content):
    """Run model prediction using external script"""
    try:
        # Create temporary file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as temp_file:
            temp_file.write(csv_content)
            temp_path = temp_file.name
        
        # Check if model runner script exists
        if not os.path.exists(MODEL_RUNNER_SCRIPT):
            print("⚠️  Model runner script not found, using rule-based classification")
            return None
        
        # Run model prediction
        result = subprocess.run([
            'python', MODEL_RUNNER_SCRIPT, temp_path
        ], capture_output=True, text=True, timeout=30)
        
        # Clean up temp file
        os.unlink(temp_path)
        
        if result.returncode == 0:
            # Parse model output
            output_lines = result.stdout.strip().split('\n')
            probabilities = {}
            
            for line in output_lines:
                if ':' in line and not line.startswith('Loaded') and not line.startswith('Final') and not line.startswith('Prediction'):
                    parts = line.split(':')
                    if len(parts) == 2:
                        condition = parts[0].strip()
                        prob_str = parts[1].strip()
                        try:
                            probabilities[condition] = float(prob_str)
                        except ValueError:
                            continue
            
            print(f"🎯 Model probabilities: {probabilities}")
            return probabilities
        else:
            print(f"❌ Model runner error: {result.stderr}")
            return None
            
    except subprocess.TimeoutExpired:
        print("❌ Model prediction timeout")
        return None
    except Exception as e:
        print(f"❌ Error running model: {e}")
        return None

def classify_with_model(ecg_data, csv_content):
    """Classify ECG using model or fallback to rule-based"""
    # Try to use model first
    model_probs = run_model_prediction(csv_content)
    
    if model_probs:
        # Create predictions from model output
        predictions = []
        for label in MODEL_LABELS:
            prob = model_probs.get(label, 0.0)
            confidence = 'High' if prob > 0.7 else 'Medium' if prob > 0.4 else 'Low'
            predictions.append({
                'condition': label,
                'probability': float(prob),
                'confidence': confidence
            })
        
        # Sort by probability
        predictions.sort(key=lambda x: x['probability'], reverse=True)
        
        # Determine if normal (all probabilities < 0.5)
        is_normal = all(p['probability'] < 0.3 for p in predictions)
        primary_diagnosis = 'Normal ECG' if is_normal else predictions[0]['condition']
        
        return {
            'predictions': predictions,
            'primary_diagnosis': primary_diagnosis,
            'is_abnormal': not is_normal,
            'model_used': True,
            'is_normal': is_normal
        }
    else:
        # Fallback to rule-based classification
        return classify_ecg_rule_based(ecg_data)

def detect_r_peaks(signal_data, sampling_rate=360):
    """Detect R peaks in ECG signal"""
    if len(signal_data) == 0:
        return []
    
    signal_array = np.array(signal_data)
    
    # Simple peak detection
    threshold = np.mean(signal_array) + 2 * np.std(signal_array)
    peaks = []
    min_peak_distance = int(0.3 * sampling_rate)
    
    for i in range(min_peak_distance, len(signal_array) - min_peak_distance):
        if (signal_array[i] > threshold and 
            signal_array[i] == np.max(signal_array[i-min_peak_distance:i+min_peak_distance])):
            peaks.append(i)
    
    return peaks

def calculate_heart_rate(lead_data, sampling_rate=360):
    """Calculate heart rate from lead data"""
    if not lead_data or len(lead_data) < sampling_rate:
        return 0
    
    r_peaks = detect_r_peaks(lead_data, sampling_rate)
    
    if len(r_peaks) < 2:
        return 0
    
    rr_intervals = np.diff(r_peaks) / sampling_rate
    avg_rr = np.mean(rr_intervals)
    heart_rate = int(60 / avg_rr) if avg_rr > 0 else 0
    
    return heart_rate

def calculate_rr_interval(lead_data, sampling_rate=360):
    """Calculate average RR interval in milliseconds"""
    r_peaks = detect_r_peaks(lead_data, sampling_rate)
    
    if len(r_peaks) < 2:
        return 0
    
    rr_intervals = np.diff(r_peaks) / sampling_rate
    avg_rr_ms = np.mean(rr_intervals) * 1000
    
    return int(avg_rr_ms)

def assess_signal_quality(leads):
    """Assess signal quality based on variance and dynamics"""
    if not leads:
        return 0
    
    qualities = []
    for lead in leads:
        if lead and len(lead) > 10:
            lead_array = np.array(lead)
            signal_range = np.max(lead_array) - np.min(lead_array)
            
            if signal_range > 0.1:
                quality = min(100, 80 + (signal_range * 50))
            else:
                quality = 30
                
            qualities.append(quality)
    
    return int(np.mean(qualities)) if qualities else 50

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
        q_search_start = max(0, r_peak - int(0.08 * sampling_rate))
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
        s_search_end = min(len(lead_data), r_peak + int(0.08 * sampling_rate))
        if s_search_end > s_search_start:
            s_point = np.argmin(lead_data[s_search_start:s_search_end]) + s_search_start
            points['S'].append({
                'index': s_point,
                'time': s_point / sampling_rate,
                'amplitude': lead_data[s_point] if s_point < len(lead_data) else 0
            })
    
    return points

def classify_ecg_rule_based(ecg_data, sampling_rate=360):
    """Rule-based ECG classification (fallback)"""
    try:
        # Use lead II for analysis
        lead_ii = ecg_data[1] if len(ecg_data) > 1 else ecg_data[0]
        
        heart_rate = calculate_heart_rate(lead_ii, sampling_rate)
        
        predictions = [
            {'condition': 'Normal ECG', 'probability': 0.8, 'confidence': 'High'},
            {'condition': 'Sinus Tachycardia', 'probability': 0.1, 'confidence': 'Low'},
            {'condition': 'Sinus Bradycardia', 'probability': 0.05, 'confidence': 'Low'},
            {'condition': 'Other Abnormalities', 'probability': 0.05, 'confidence': 'Low'}
        ]
        
        # Adjust based on heart rate
        if heart_rate > 100:
            predictions[0]['probability'] = 0.4
            predictions[1]['probability'] = 0.5
        elif heart_rate < 60:
            predictions[0]['probability'] = 0.5
            predictions[2]['probability'] = 0.4
        
        predictions.sort(key=lambda x: x['probability'], reverse=True)
        
        return {
            'predictions': predictions,
            'primary_diagnosis': predictions[0]['condition'],
            'is_abnormal': predictions[0]['condition'] != 'Normal ECG',
            'model_used': False
        }
        
    except Exception as e:
        print(f"❌ Error in rule-based classification: {e}")
        return get_fallback_prediction()

def get_fallback_prediction():
    """Fallback prediction"""
    return {
        'predictions': [
            {'condition': 'Normal ECG', 'probability': 0.75, 'confidence': 'High'},
            {'condition': 'Sinus Tachycardia', 'probability': 0.12, 'confidence': 'Low'},
            {'condition': 'Sinus Bradycardia', 'probability': 0.08, 'confidence': 'Low'},
            {'condition': 'Other Abnormalities', 'probability': 0.05, 'confidence': 'Low'}
        ],
        'primary_diagnosis': 'Normal ECG',
        'is_abnormal': False,
        'model_used': False
    }

# ==================== ROUTES ====================

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/ecg-analysis')
def ecg_analysis():
    return render_template('ECG-Analysis.html')

@app.route('/assets/<path:filename>')
def serve_assets(filename):
    return send_from_directory('../Frontend/assets', filename)

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    model_available = os.path.exists(MODEL_RUNNER_SCRIPT)
    return jsonify({
        'status': 'healthy',
        'message': 'ECG Analyzer API is running!',
        'model_available': model_available,
        'model_labels': MODEL_LABELS,
        'endpoints': {
            'upload_ecg': 'POST /api/upload-ecg',
            'classify_ecg': 'POST /api/classify-ecg'
        }
    })

@app.route('/api/upload-ecg', methods=['POST'])
def upload_ecg():
    print("\n" + "="*50)
    print("📁 ECG UPLOAD ENDPOINT CALLED")
    print("="*50)
    
    try:
        if 'ecg_file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['ecg_file']
        print(f"📄 File received: {file.filename}")
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': 'Invalid file type'}), 400

        # Read file content (keep for model processing)
        file_content = file.read().decode('utf-8')
        file.seek(0)  # Reset file pointer for reading again
        csv_content = file.read().decode('utf-8')
        
        print(f"📊 File size: {len(file_content)} characters")
        
        sampling_rate = int(request.form.get('sampling_rate', 360))
        print(f"🎯 Sampling rate: {sampling_rate} Hz")

        ecg_data = parse_ecg_csv(file_content, sampling_rate)
        
        if ecg_data is None:
            return jsonify({'error': 'Failed to parse ECG file'}), 400
        
        lead_ii_data = ecg_data['leads'][1] if len(ecg_data['leads']) > 1 else ecg_data['leads'][0]
        
        # Store CSV content for model processing
        ecg_data['csv_content'] = csv_content
        
        basic_analysis = {
            'heart_rate': calculate_heart_rate(lead_ii_data, sampling_rate),
            'rr_interval': calculate_rr_interval(lead_ii_data, sampling_rate),
            'signal_quality': assess_signal_quality(ecg_data['leads']),
            'total_beats': len(detect_r_peaks(lead_ii_data, sampling_rate))
        }
        
        response_data = {
            'message': 'ECG file processed successfully!',
            'data': ecg_data,
            'analysis': basic_analysis
        }
        
        print("✅ File parsed successfully!")
        print(f"❤️  Heart Rate: {basic_analysis['heart_rate']} bpm")
        print("="*50)
        
        return jsonify(response_data)
        
    except Exception as e:
        print(f"💥 Upload error: {str(e)}")
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/api/classify-ecg', methods=['POST'])
def classify_ecg_route():
    print("\n" + "="*50)
    print("🧠 CLASSIFICATION ENDPOINT CALLED")
    print("="*50)
    
    try:
        data = request.get_json()
        
        if not data or 'ecg_data' not in data:
            return jsonify({'error': 'No ECG data provided'}), 400
        
        ecg_leads = data['ecg_data']
        csv_content = data.get('csv_content', '')
        sampling_rate = data.get('sampling_rate', 360)
        
        if len(ecg_leads) != 12:
            return jsonify({'error': 'Expected 12 leads of ECG data'}), 400
        
        print(f"📊 Classifying ECG with {len(ecg_leads[0])} samples per lead...")
        
        # Classify using model or rule-based
        classification_result = classify_with_model(ecg_leads, csv_content)
        
        print(f"✅ Classification completed!")
        print(f"🏥 Primary diagnosis: {classification_result['primary_diagnosis']}")
        print(f"🤖 Model used: {classification_result['model_used']}")
        print("="*50)
        
        return jsonify(classification_result)
        
    except Exception as e:
        print(f"💥 Classification error: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    model_available = os.path.exists(MODEL_RUNNER_SCRIPT)
    
    print("\n" + "="*60)
    print("🚀 STARTING ECG ANALYZER SERVER")
    print("="*60)
    print("📍 Server URL: http://localhost:5000")
    print("📍 Health check: GET http://localhost:5000/api/health")
    print(f"📍 Model available: {model_available}")
    if model_available:
        print(f"📍 Model labels: {MODEL_LABELS}")
    print("="*60)
    
    app.run(debug=True, port=5000, host='0.0.0.0')