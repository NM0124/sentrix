import os
import requests
import base64
import json
from functools import wraps
from flask import Flask, request, jsonify, redirect, session, url_for, send_from_directory, render_template
from flask_cors import CORS
from dotenv import load_dotenv

import ibm_services

# Load env variables
load_dotenv()

app = Flask(__name__)
CORS(app)
app.secret_key = os.getenv('FLASK_SECRET_KEY', 'default_secret_for_development')

def auth_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user' not in session:
            return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)
    return decorated_function

@app.before_request
def check_auth():
    if request.path == '/admin-dashboard.html' or request.path == '/static/admin.js':
        if 'user' not in session:
            return redirect('/admin-login.html')

# ==========================================
# Frontend Serving Routes
# ==========================================

@app.route('/')
@app.route('/index.html')
def serve_index():
    return render_template('index.html')

@app.route('/admin-dashboard.html')
def serve_dashboard():
    return render_template('admin-dashboard.html')

@app.route('/admin-login.html')
def serve_login():
    return render_template('admin-login.html')

@app.route('/unauthorized.html')
def serve_unauthorized():
    return render_template('unauthorized.html')


# ==========================================
# Core API Routes
# ==========================================

@app.route('/api/analyze', methods=['POST'])
def analyze():
    data = request.json
    text = data.get('text', '')
    
    if not text:
        return jsonify({"error": "No text provided"}), 400
        
    try:
        result = ibm_services.analyze_text(text)
        ibm_services.save_log(result)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/logs', methods=['GET'])
@auth_required
def get_logs():
    try:
        logs = ibm_services.get_logs()
        return jsonify(logs)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/stats', methods=['GET'])
@auth_required
def get_stats():
    try:
        stats = ibm_services.get_stats()
        return jsonify(stats)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/logs/<doc_id>', methods=['DELETE'])
@auth_required
def delete_log_route(doc_id):
    rev = request.args.get('rev')
    if not rev:
        return jsonify({"error": "Missing document revision (rev)"}), 400
    try:
        ibm_services.delete_log(doc_id, rev)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/logs/<doc_id>', methods=['PATCH'])
@auth_required
def patch_log_route(doc_id):
    try:
        data = request.get_json(silent=True) or {}
        status = data.get('status')
        if not status:
            return jsonify({"error": "Missing status"}), 400
        doc = ibm_services.update_log_status(doc_id, status)
        
        if status == "escalated":
            try:
                ibm_services.send_escalation_email(doc)
            except Exception as e:
                pass
                
        return jsonify({"success": True})
    except Exception as e:
        import traceback

        return jsonify({"error": str(e)}), 500


# ==========================================
# IBM App ID Routes (Structure)
# ==========================================

APPID_CLIENT_ID = os.getenv('APPID_CLIENT_ID')
APPID_CLIENT_SECRET = os.getenv('APPID_CLIENT_SECRET')
APPID_OAUTH_SERVER_URL = os.getenv('APPID_OAUTH_SERVER_URL')

@app.route('/api/auth/login')
def login():
    if not APPID_CLIENT_ID or not APPID_OAUTH_SERVER_URL or APPID_CLIENT_ID == 'your_appid_client_id_here':
        return jsonify({"error": "IBM App ID is not configured in .env"}), 500
        
    redirect_uri = url_for('callback', _external=True)
    auth_url = f"{APPID_OAUTH_SERVER_URL}/authorization?client_id={APPID_CLIENT_ID}&response_type=code&redirect_uri={redirect_uri}&scope=openid profile email"
    return redirect(auth_url)

@app.route('/api/auth/callback')
def callback():
    code = request.args.get('code')
    if not code:
        return jsonify({"error": "No authorization code provided"}), 400
        
    token_url = f"{APPID_OAUTH_SERVER_URL}/token"
    redirect_uri = url_for('callback', _external=True)
    
    payload = {
        'client_id': APPID_CLIENT_ID,
        'grant_type': 'authorization_code',
        'redirect_uri': redirect_uri,
        'code': code
    }
    
    auth_header = "Basic " + base64.b64encode(f"{APPID_CLIENT_ID}:{APPID_CLIENT_SECRET}".encode('utf-8')).decode('utf-8')
    headers = {
        'Authorization': auth_header,
        'Content-Type': 'application/x-www-form-urlencoded'
    }
    
    try:
        response = requests.post(token_url, data=payload, headers=headers)
        response.raise_for_status()
        tokens = response.json()
        
        id_token = tokens.get('id_token')
        if id_token:
            payload_b64 = id_token.split('.')[1]
            payload_b64 += '=' * (-len(payload_b64) % 4) # pad
            id_payload = json.loads(base64.b64decode(payload_b64).decode('utf-8'))
            
            # Email Authorization Check
            email = id_payload.get('email', '').strip().lower()
            allowed_emails_env = os.getenv('ALLOWED_ADMIN_EMAILS', '')
            allowed_emails = [e.strip().lower() for e in allowed_emails_env.split(',') if e.strip()]
            
            if email not in allowed_emails:
                return redirect('/unauthorized.html')
                
            session['user'] = {'name': id_payload.get('name', 'Admin User'), 'email': email}
        else:
            return jsonify({"error": "Failed to retrieve identity from IBM App ID"}), 401
            
        return redirect('/admin-dashboard.html')
    except Exception as e:

        return jsonify({"error": "Failed to exchange token with IBM App ID"}), 500

@app.route('/api/auth/logout')
def logout():
    session.clear()
    return redirect('/index.html')

@app.route('/api/user')
def get_user():
    user = session.get('user')
    if user:
        return jsonify({"authenticated": True, "user": user})
    return jsonify({"authenticated": False}), 401


if __name__ == '__main__':

    app.run(debug=True, port=5000)
