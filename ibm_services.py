import os
import uuid
import json
from datetime import datetime
import traceback
import google.generativeai as genai
import resend

# IBM NLU
from ibm_watson import NaturalLanguageUnderstandingV1
from ibm_cloud_sdk_core.authenticators import IAMAuthenticator
from ibm_watson.natural_language_understanding_v1 import Features, EntitiesOptions, SentimentOptions, KeywordsOptions, CategoriesOptions, EmotionOptions

# IBM Cloudant
from ibmcloudant.cloudant_v1 import CloudantV1
from ibm_cloud_sdk_core.authenticators import IAMAuthenticator as CloudantAuthenticator

def get_nlu_service():
    apikey = os.getenv('NLU_APIKEY')
    url = os.getenv('NLU_URL')
    if not apikey or not url or apikey == 'your_nlu_apikey_here':
        raise ValueError("IBM NLU credentials are not configured in .env")
    try:
        authenticator = IAMAuthenticator(apikey)
        nlu = NaturalLanguageUnderstandingV1(
            version='2022-04-07',
            authenticator=authenticator
        )
        nlu.set_service_url(url)
        return nlu
    except Exception as e:
        print(f"Error initializing NLU: {e}")
        raise e

def get_cloudant_service():
    apikey = os.getenv('CLOUDANT_APIKEY')
    url = os.getenv('CLOUDANT_URL')
    if not apikey or not url or apikey == 'your_cloudant_apikey_here':
        raise ValueError("IBM Cloudant credentials are not configured in .env")
    try:
        authenticator = CloudantAuthenticator(apikey)
        cloudant = CloudantV1(authenticator=authenticator)
        cloudant.set_service_url(url)
        return cloudant
    except Exception as e:
        print(f"Error initializing Cloudant: {e}")
        raise e

def analyze_text(text):
    nlu = get_nlu_service()

    # Call real IBM NLU
    try:
        response = nlu.analyze(
            text=text,
            features=Features(
                sentiment=SentimentOptions(),
                keywords=KeywordsOptions(limit=5),
                categories=CategoriesOptions(limit=3),
                entities=EntitiesOptions(limit=5),
                emotion=EmotionOptions()
            )
        ).get_result()
        
        return combine_nlu_and_gemini(response, text)

    except Exception as e:
        print(f"NLU Analysis failed: {e}")
        traceback.print_exc()
        raise Exception(f"Failed to analyze text with NLU: {e}")

def analyze_with_gemini(text, nlu_context):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or api_key == "your_gemini_api_key_here":
        raise ValueError("Gemini API key not configured. Please add GEMINI_API_KEY to .env")
        
    genai.configure(api_key=api_key)
    
    # Use gemini-2.5-flash for fast reasoning
    model = genai.GenerativeModel('gemini-2.5-flash')
    
    prompt = f"""
    You are the core reasoning engine for Sentrix, a content moderation and threat intelligence platform.
    Analyze the following text and the provided structural context from IBM NLU.
    
    TEXT:
    "{text}"
    
    NLU CONTEXT:
    - Sentiment: {nlu_context.get('sentiment')} (Score: {nlu_context.get('sentiment_score')})
    - Keywords: {', '.join(nlu_context.get('keywords', []))}
    - Entities: {', '.join(nlu_context.get('entities', []))}
    - Categories: {', '.join(nlu_context.get('categories', []))}
    - Emotions: {json.dumps(nlu_context.get('emotions', {}))}
    
    TASK:
    Classify the content into one of the following exact intent categories:
    - Safe
    - Threat
    - Potential Fake News
    - Harmful / Hate
    - Suspicious
    
    IMPORTANT RULES FOR FAKE NEWS:
    Do NOT assess guaranteed truth or certainty. Instead, flag for likely misinformation, unsupported sensational claims, suspicious logic, or content that needs verification.
    
    OUTPUT FORMAT:
    Respond ONLY with a valid JSON object matching this schema exactly, with no markdown formatting or backticks:
    {{
      "intent": "<one of the 5 intents above>",
      "risk_level": "<Safe, Warning, or High Risk>",
      "severity": "<Low, Medium, High, or Critical>",
      "confidence": <integer 0-100>,
      "reason": "<A concise, 1-2 sentence explanation of your reasoning based on the content and context>",
      "flagged": <boolean true or false>,
      "recommendation": "<A short recommendation for the human reviewer>"
    }}
    """
    
    response = model.generate_content(prompt)
    
    # Clean the response string in case Gemini includes markdown formatting
    response_text = response.text.strip()
    if response_text.startswith("```json"):
        response_text = response_text[7:]
    if response_text.startswith("```"):
        response_text = response_text[3:]
    if response_text.endswith("```"):
        response_text = response_text[:-3]
        
    return json.loads(response_text.strip())


def combine_nlu_and_gemini(nlu_data, original_text):
    """Processes the raw NLU response and uses Gemini for final classification."""
    
    # 1. Extract context from NLU
    sentiment_label = nlu_data.get('sentiment', {}).get('document', {}).get('label', 'neutral').capitalize()
    sentiment_score = nlu_data.get('sentiment', {}).get('document', {}).get('score', 0)
    
    keywords = [kw['text'] for kw in nlu_data.get('keywords', [])]
    entities = [ent['type'] for ent in nlu_data.get('entities', [])]
    categories = [cat['label'] for cat in nlu_data.get('categories', [])]
    
    emotions = nlu_data.get('emotion', {}).get('document', {}).get('emotion', {})
    
    nlu_context = {
        "sentiment": sentiment_label,
        "sentiment_score": sentiment_score,
        "keywords": keywords,
        "entities": entities,
        "categories": categories,
        "emotions": emotions
    }
    
    # 2. Call Gemini
    try:
        gemini_result = analyze_with_gemini(original_text, nlu_context)
        
        # 3. Construct Final Payload
        return {
            "id": f"TX-{str(uuid.uuid4())[:6].upper()}",
            "content": original_text,
            "sentiment": sentiment_label,
            "intent": gemini_result.get("intent", "Suspicious"),
            "risk_level": gemini_result.get("risk_level", "Warning"),
            "severity": gemini_result.get("severity", "Medium"),
            "confidence": gemini_result.get("confidence", 50),
            "reason": gemini_result.get("reason", "Analysis completed by AI."),
            "keywords": keywords,
            "harmful_indicators": [], # Deprecated by reason field, keeping for schema compatibility
            "flagged": gemini_result.get("flagged", True),
            "recommendation": gemini_result.get("recommendation", "Review manually."),
            "time": datetime.utcnow().isoformat(),
            "status": "pending"
        }
    except Exception as e:
        print(f"Gemini Integration Failed: {e}")
        traceback.print_exc()
        # Fallback to backend error
        raise Exception(f"AI Reasoning Layer Failed: {e}")


def save_log(data):
    cloudant = get_cloudant_service()
    db_name = os.getenv('CLOUDANT_DB_NAME', 'sentrix_logs')
    
    try:
        # Create DB if not exists
        try:
            cloudant.put_database(db=db_name).get_result()
        except Exception:
            pass # DB already exists
            
        cloudant.post_document(db=db_name, document=data).get_result()
        return True
    except Exception as e:
        print(f"Error saving to Cloudant: {e}")
        raise Exception(f"Failed to save log to Cloudant: {e}")

def get_logs():
    cloudant = get_cloudant_service()
    db_name = os.getenv('CLOUDANT_DB_NAME', 'sentrix_logs')
    
    try:
        response = cloudant.post_all_docs(db=db_name, include_docs=True, descending=True, limit=50).get_result()
        return [row['doc'] for row in response.get('rows', [])]
    except Exception as e:
        print(f"Error fetching from Cloudant: {e}")
        raise Exception(f"Failed to fetch logs from Cloudant: {e}")

def delete_log(doc_id, doc_rev):
    cloudant = get_cloudant_service()
    db_name = os.getenv('CLOUDANT_DB_NAME', 'sentrix_logs')
    try:
        response = cloudant.delete_document(
            db=db_name,
            doc_id=doc_id,
            rev=doc_rev
        ).get_result()
        return response
    except Exception as e:
        print(f"Error deleting from Cloudant: {e}")
        raise Exception(f"Failed to delete log: {e}")

def update_log_status(doc_id, status):
    cloudant = get_cloudant_service()
    db_name = os.getenv('CLOUDANT_DB_NAME', 'sentrix_logs')
    try:
        # Get document to get the latest rev
        doc = cloudant.get_document(db=db_name, doc_id=doc_id).get_result()
        doc['status'] = status
        # Put updated document
        response = cloudant.put_document(db=db_name, doc_id=doc_id, document=doc).get_result()
        return doc
    except Exception as e:
        print(f"Error updating in Cloudant: {e}")
        raise Exception(f"Failed to update log status: {e}")

def get_stats():
    logs = get_logs()
    total = len(logs)
    high_risk = len([l for l in logs if l.get('risk_level') == 'High Risk'])
    fake_news = len([l for l in logs if l.get('intent') == 'Potential Fake News'])
    pending = len([l for l in logs if l.get('status', 'pending') == 'pending'])
    
    return {
        "total_analyses": total,
        "high_risk_cases": high_risk,
        "fake_news_detected": fake_news,
        "pending_reviews": pending
    }

def send_escalation_email(log_data):
    api_key = os.getenv('RESEND_API_KEY')
    escalation_emails_str = os.getenv('ESCALATION_EMAILS')
    from_email = os.getenv('RESEND_FROM_EMAIL', 'onboarding@resend.dev')

    if not api_key or not escalation_emails_str:
        print("Escalation logged (Resend API key or recipients not configured)")
        return

    resend.api_key = api_key

    recipients = [email.strip() for email in escalation_emails_str.split(',') if email.strip()]
    if not recipients:
        print("Escalation logged (no recipients configured)")
        return

    subject = "🚨 Sentrix Escalation Alert"
    body = f"""Escalated Alert Detected

Alert ID: {log_data.get('id', 'N/A')}
Time: {log_data.get('time', 'N/A')}

Content:
{log_data.get('content', 'N/A')}

Intent: {log_data.get('intent', 'N/A')}
Risk Level: {log_data.get('risk_level', 'N/A')}
Confidence: {log_data.get('confidence', 'N/A')}

Recommendation:
{log_data.get('recommendation', 'N/A')}
"""

    try:
        response = resend.Emails.send({
            "from": f"Sentrix Security <{from_email}>",
            "to": recipients,
            "subject": subject,
            "text": body
        })
        print(f"Escalation email sent via Resend to {', '.join(recipients)}")
    except Exception as e:
        print(f"Failed to send escalation email via Resend: {e}")

