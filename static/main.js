/**
 * Sentrix Main Logic
 * Handles the text analysis simulation for the frontend demo.
 */

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('analyzer-form');
    if (!form) return;

    const input = document.getElementById('content-input');
    const analyzeBtn = document.getElementById('analyze-btn');
    const loadingState = document.getElementById('loading-state');
    const resultsPanel = document.getElementById('results-panel');

    // Result elements
    const badgeRisk = document.getElementById('risk-badge');
    const resSentiment = document.getElementById('res-sentiment');
    const resIntent = document.getElementById('res-intent');
    const resConfidence = document.getElementById('res-confidence');
    const resKeywords = document.getElementById('res-keywords');
    const resReason = document.getElementById('res-reason');
    const resRecommendation = document.getElementById('res-recommendation');

    // No simulated knowledge base required, backend handles logic.

    // --- File Upload Logic ---
    const uploadBtn = document.getElementById('upload-btn');
    const fileUpload = document.getElementById('file-upload');
    const uploadText = document.getElementById('upload-text');

    if (uploadBtn && fileUpload) {
        uploadBtn.addEventListener('click', () => {
            fileUpload.click();
        });

        fileUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const validTypes = ['text/plain', 'text/csv', 'application/json'];
            const validExtensions = ['.txt', '.csv', '.json'];
            const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

            if (!validTypes.includes(file.type) && !validExtensions.includes(fileExt)) {
                alert('Please upload a valid text, CSV, or JSON file.');
                fileUpload.value = '';
                return;
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                input.value = event.target.result;
                uploadText.textContent = file.name.length > 15 ? file.name.substring(0, 15) + '...' : file.name;
            };
            reader.onerror = () => {
                alert('Error reading file.');
            };
            reader.readAsText(file);
        });
    }

    // --- Voice Input Logic (Web Speech API) ---
    const voiceBtn = document.getElementById('voice-btn');
    const voiceText = document.getElementById('voice-text');
    let recognition = null;
    let isListening = false;

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            isListening = true;
            voiceText.textContent = 'Listening...';
            voiceBtn.style.color = 'var(--destructive)';
            voiceBtn.style.borderColor = 'var(--destructive)';
        };

        recognition.onresult = (event) => {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }
            if (finalTranscript) {
                const currentVal = input.value.trim();
                input.value = currentVal ? currentVal + ' ' + finalTranscript : finalTranscript;
            }
        };

        recognition.onerror = (event) => {

            if (event.error === 'not-allowed') {
                alert('Microphone access denied. Please allow microphone access to use voice input.');
            }
            stopListening();
        };

        recognition.onend = () => {
            stopListening();
        };

        function stopListening() {
            isListening = false;
            voiceText.textContent = 'Voice';
            voiceBtn.style.color = '';
            voiceBtn.style.borderColor = '';
        }

        if (voiceBtn) {
            voiceBtn.addEventListener('click', () => {
                if (isListening) {
                    recognition.stop();
                } else {
                    recognition.start();
                }
            });
        }
    } else {
        if (voiceBtn) {
            voiceBtn.addEventListener('click', () => {
                alert('Speech recognition is not supported in this browser.');
            });
        }
    }
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;

        // UI Reset
        resultsPanel.classList.remove('active');
        loadingState.style.display = 'block';
        analyzeBtn.disabled = true;

        try {
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                throw new Error(errorData?.error || 'Analysis request failed');
            }
            
            const data = await response.json();
            updateUI(data);
            
            loadingState.style.display = 'none';
            resultsPanel.classList.add('active');
        } catch (error) {

            alert(`An error occurred: ${error.message}`);
            loadingState.style.display = 'none';
        } finally {
            analyzeBtn.disabled = false;
        }
    });

    function updateUI(data) {
        // Update Risk Badge
        updateBadge(badgeRisk, data.risk_level);
        
        // Sentiment UI
        const sentimentColors = {
            'Positive': 'var(--success)',
            'Neutral': 'var(--muted-foreground)',
            'Negative': 'var(--destructive)'
        };
        const sentimentIcons = {
            'Positive': 'smile',
            'Neutral': 'activity',
            'Negative': 'frown'
        };
        const sColor = sentimentColors[data.sentiment] || sentimentColors['Neutral'];
        const sIcon = sentimentIcons[data.sentiment] || sentimentIcons['Neutral'];
        
        resSentiment.innerHTML = `<i data-lucide="${sIcon}" style="width: 20px; color: ${sColor}"></i><span style="color: ${sColor}">${data.sentiment}</span>`;

        // Intent UI
        resIntent.innerHTML = `<i data-lucide="target" style="width: 20px;"></i><span>${data.intent}</span>`;
        
        // Confidence
        resConfidence.textContent = `${data.confidence}%`;
        
        // AI Reason
        if (resReason) {
            resReason.textContent = data.reason || "Analysis completed.";
        }
        
        // Recommendation
        resRecommendation.textContent = data.recommendation;
        if (data.risk_level === 'High Risk') {
            resRecommendation.style.color = 'var(--destructive)';
        } else if (data.risk_level === 'Warning') {
            resRecommendation.style.color = 'var(--warning)';
        } else {
            resRecommendation.style.color = 'var(--foreground)';
        }

        // Keywords
        if (data.keywords && data.keywords.length > 0) {
            resKeywords.innerHTML = data.keywords.map(kw => 
                `<span class="badge badge-outline" style="background-color: var(--card);">${kw}</span>`
            ).join('');
        } else {
            resKeywords.innerHTML = `<span class="text-sm text-muted">No specific trigger words detected</span>`;
        }

        // Re-initialize icons for dynamically added content
        if(window.lucide) {
            window.lucide.createIcons();
        }
    }

    function updateBadge(element, level) {
        element.textContent = level;
        element.className = 'badge'; // reset
        
        if (level === 'High Risk') {
            element.classList.add('badge-destructive');
        } else if (level === 'Warning') {
            element.classList.add('badge-warning');
        } else {
            element.classList.add('badge-success');
        }
    }
});
