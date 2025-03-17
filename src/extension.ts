import * as vscode from 'vscode';

// Store global state
let ttsEnabled = true;
let ttsPanel: vscode.WebviewPanel | undefined;

// Extension activation - called when the extension is activated
export function activate(context: vscode.ExtensionContext) {
    console.log('Cursor AI TTS extension is now active');

    // Load configuration
    const config = vscode.workspace.getConfiguration('cursor-ai-tts');
    ttsEnabled = config.get('enabled') as boolean;

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('cursor-ai-tts.enable', () => {
            ttsEnabled = true;
            vscode.workspace.getConfiguration('cursor-ai-tts').update('enabled', true, true);
            vscode.window.showInformationMessage('Text-to-Speech for AI responses enabled');
            ensureTTSPanelExists(context);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cursor-ai-tts.disable', () => {
            ttsEnabled = false;
            vscode.workspace.getConfiguration('cursor-ai-tts').update('enabled', false, true);
            vscode.window.showInformationMessage('Text-to-Speech for AI responses disabled');
            disposeTTSPanel();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cursor-ai-tts.showSettings', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'cursor-ai-tts');
        })
    );

    // Create TTS panel if enabled
    if (ttsEnabled) {
        ensureTTSPanelExists(context);
    }

    // Watch for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('cursor-ai-tts')) {
                const newConfig = vscode.workspace.getConfiguration('cursor-ai-tts');
                const wasEnabled = ttsEnabled;
                ttsEnabled = newConfig.get('enabled') as boolean;
                
                if (ttsEnabled && !wasEnabled) {
                    ensureTTSPanelExists(context);
                } else if (!ttsEnabled && wasEnabled) {
                    disposeTTSPanel();
                } else if (ttsEnabled && ttsPanel) {
                    // Update TTS settings
                    updateTTSSettings();
                }
            }
        })
    );
}

// Creates or shows the TTS Webview panel
function ensureTTSPanelExists(context: vscode.ExtensionContext) {
    if (ttsPanel) {
        ttsPanel.reveal(vscode.ViewColumn.Two);
        return;
    }

    // Create and show panel
    ttsPanel = vscode.window.createWebviewPanel(
        'cursorAiTTS',
        'Cursor AI TTS',
        {
            viewColumn: vscode.ViewColumn.Two,
            preserveFocus: true
        },
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    // Set initial content
    ttsPanel.webview.html = getTTSPanelContent();

    // Handle disposal
    ttsPanel.onDidDispose(() => {
        ttsPanel = undefined;
    }, null, context.subscriptions);

    // Handle messages from the webview
    ttsPanel.webview.onDidReceiveMessage(message => {
        switch (message.command) {
            case 'ready':
                // TTS service is ready in the webview
                console.log('TTS service ready in webview');
                setupTTSObserver();
                break;
            case 'log':
                console.log('TTS Webview:', message.text);
                break;
        }
    });
}

// Set up the observer to detect new AI responses
function setupTTSObserver() {
    if (!ttsPanel) return;

    ttsPanel.webview.postMessage({
        command: 'setupObserver',
        selectors: [
            '.cursor-chat-message-ai',
            '.ai-message',
            '.chat-entry[data-role="assistant"]',
            '.message-container[data-sender="assistant"]',
            '.agent-turn',
            '.chat-message-ai'
        ]
    });
}

// Dispose of the TTS panel
function disposeTTSPanel() {
    if (ttsPanel) {
        ttsPanel.dispose();
        ttsPanel = undefined;
    }
}

// Update TTS settings in the webview
function updateTTSSettings() {
    if (!ttsPanel) return;

    const config = vscode.workspace.getConfiguration('cursor-ai-tts');
    ttsPanel.webview.postMessage({
        command: 'updateSettings',
        settings: {
            voice: config.get('voice'),
            rate: config.get('rate'),
            pitch: config.get('pitch'),
            filterCodeBlocks: config.get('filterCodeBlocks')
        }
    });
}

// Create the webview HTML content
function getTTSPanelContent() {
    const config = vscode.workspace.getConfiguration('cursor-ai-tts');
    
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Cursor AI TTS</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                padding: 10px;
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
            }
            .controls {
                margin: 10px 0;
            }
            label {
                display: block;
                margin: 5px 0;
            }
            select, input {
                margin-bottom: 10px;
                width: 100%;
            }
            #status {
                margin-top: 20px;
                padding: 10px;
                background-color: var(--vscode-editor-inactiveSelectionBackground);
                border-radius: 3px;
            }
            button {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 5px 10px;
                cursor: pointer;
                border-radius: 2px;
            }
            button:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
            .hidden {
                display: none;
            }
        </style>
    </head>
    <body>
        <h2>Cursor AI TTS Service</h2>
        <div id="controls" class="controls">
            <label for="voice-select">Voice:</label>
            <select id="voice-select"></select>
            
            <label for="rate">Rate: <span id="rate-value">1.0</span></label>
            <input type="range" id="rate" min="0.5" max="2" step="0.1" value="${config.get('rate')}">
            
            <label for="pitch">Pitch: <span id="pitch-value">1.0</span></label>
            <input type="range" id="pitch" min="0.5" max="2" step="0.1" value="${config.get('pitch')}">
            
            <div>
                <label>
                    <input type="checkbox" id="filter-code" ${config.get('filterCodeBlocks') ? 'checked' : ''}>
                    Skip code blocks when reading
                </label>
            </div>
            
            <button id="stop-button">Stop Speech</button>
        </div>
        
        <div id="status">
            TTS service running. Waiting for AI responses...
        </div>
        
        <script>
            // TTS Service implementation
            class TTSService {
                constructor() {
                    this.synth = window.speechSynthesis;
                    this.voice = null;
                    this.rate = ${config.get('rate')};
                    this.pitch = ${config.get('pitch')};
                    this.volume = 1.0;
                    this.filterCodeBlocks = ${config.get('filterCodeBlocks')};
                    
                    this.voices = [];
                    this.loadVoices();
                    
                    if (this.synth.onvoiceschanged !== undefined) {
                        this.synth.onvoiceschanged = this.loadVoices.bind(this);
                    }
                    
                    this.currentUtterance = null;
                    this.textQueue = [];
                    this.isSpeaking = false;
                    
                    // Initialize voice selector
                    this.populateVoiceList();
                    
                    // Set up UI events
                    this.setupUIEvents();
                }
                
                loadVoices() {
                    this.voices = this.synth.getVoices();
                    
                    if (this.voices.length > 0) {
                        // Prefer English voices if available
                        const englishVoices = this.voices.filter(voice => 
                            voice.lang.startsWith('en-')
                        );
                        
                        if (englishVoices.length > 0) {
                            this.voice = englishVoices[0];
                        } else {
                            this.voice = this.voices[0];
                        }
                        
                        // Try to set saved voice preference
                        const savedVoice = '${config.get('voice')}';
                        if (savedVoice) {
                            const voice = this.voices.find(v => v.name === savedVoice);
                            if (voice) {
                                this.voice = voice;
                            }
                        }
                    }
                    
                    this.populateVoiceList();
                }
                
                populateVoiceList() {
                    const voiceSelect = document.getElementById('voice-select');
                    if (!voiceSelect) return;
                    
                    // Clear existing options
                    voiceSelect.innerHTML = '';
                    
                    this.voices.forEach(voice => {
                        const option = document.createElement('option');
                        option.textContent = \`\${voice.name} (\${voice.lang})\`;
                        option.setAttribute('data-voice-name', voice.name);
                        
                        if (this.voice && voice.name === this.voice.name) {
                            option.selected = true;
                        }
                        
                        voiceSelect.appendChild(option);
                    });
                }
                
                setupUIEvents() {
                    // Voice selection
                    const voiceSelect = document.getElementById('voice-select');
                    voiceSelect.addEventListener('change', () => {
                        const selectedOption = voiceSelect.selectedOptions[0];
                        const voiceName = selectedOption.getAttribute('data-voice-name');
                        this.setVoice(voiceName);
                        
                        // Notify extension of setting change
                        vscode.postMessage({
                            command: 'settingChanged',
                            setting: 'voice',
                            value: voiceName
                        });
                    });
                    
                    // Rate control
                    const rateInput = document.getElementById('rate');
                    const rateValue = document.getElementById('rate-value');
                    rateInput.addEventListener('input', () => {
                        const rate = parseFloat(rateInput.value);
                        rateValue.textContent = rate.toFixed(1);
                        this.rate = rate;
                        
                        vscode.postMessage({
                            command: 'settingChanged',
                            setting: 'rate',
                            value: rate
                        });
                    });
                    
                    // Pitch control
                    const pitchInput = document.getElementById('pitch');
                    const pitchValue = document.getElementById('pitch-value');
                    pitchInput.addEventListener('input', () => {
                        const pitch = parseFloat(pitchInput.value);
                        pitchValue.textContent = pitch.toFixed(1);
                        this.pitch = pitch;
                        
                        vscode.postMessage({
                            command: 'settingChanged',
                            setting: 'pitch',
                            value: pitch
                        });
                    });
                    
                    // Filter code blocks option
                    const filterCodeCheckbox = document.getElementById('filter-code');
                    filterCodeCheckbox.addEventListener('change', () => {
                        this.filterCodeBlocks = filterCodeCheckbox.checked;
                        
                        vscode.postMessage({
                            command: 'settingChanged',
                            setting: 'filterCodeBlocks',
                            value: this.filterCodeBlocks
                        });
                    });
                    
                    // Stop button
                    const stopButton = document.getElementById('stop-button');
                    stopButton.addEventListener('click', () => {
                        this.stop();
                    });
                    
                    // Update initial UI state
                    rateValue.textContent = this.rate.toFixed(1);
                    pitchValue.textContent = this.pitch.toFixed(1);
                }
                
                getVoices() {
                    return this.voices;
                }
                
                setVoice(name) {
                    const voice = this.voices.find(v => v.name === name);
                    if (voice) {
                        this.voice = voice;
                    }
                }
                
                setRate(rate) {
                    this.rate = rate;
                    document.getElementById('rate').value = rate;
                    document.getElementById('rate-value').textContent = rate.toFixed(1);
                }
                
                setPitch(pitch) {
                    this.pitch = pitch;
                    document.getElementById('pitch').value = pitch;
                    document.getElementById('pitch-value').textContent = pitch.toFixed(1);
                }
                
                setFilterCodeBlocks(filter) {
                    this.filterCodeBlocks = filter;
                    document.getElementById('filter-code').checked = filter;
                }
                
                segmentText(text) {
                    // Split by sentences
                    const sentences = text.split(/(?<=[.!?])\\s+/);
                    const segments = [];
                    let currentSegment = '';
                    
                    sentences.forEach(sentence => {
                        if (currentSegment.length + sentence.length > 200) {
                            if (currentSegment.length > 0) {
                                segments.push(currentSegment);
                            }
                            currentSegment = sentence;
                        } else {
                            if (currentSegment.length > 0) {
                                currentSegment += ' ';
                            }
                            currentSegment += sentence;
                        }
                    });
                    
                    if (currentSegment.length > 0) {
                        segments.push(currentSegment);
                    }
                    
                    return segments;
                }
                
                speak(text) {
                    this.stop();
                    
                    updateStatus(\`Speaking: \${text.substring(0, 50)}...\`);
                    
                    this.textQueue = this.segmentText(text);
                    this.speakNextSegment();
                }
                
                speakNextSegment() {
                    if (this.textQueue.length === 0) {
                        this.isSpeaking = false;
                        updateStatus('TTS service running. Waiting for AI responses...');
                        return;
                    }
                    
                    const text = this.textQueue.shift();
                    
                    const utterance = new SpeechSynthesisUtterance(text);
                    
                    if (this.voice) {
                        utterance.voice = this.voice;
                    }
                    utterance.rate = this.rate;
                    utterance.pitch = this.pitch;
                    utterance.volume = this.volume;
                    
                    utterance.onend = () => {
                        if (this.textQueue.length > 0) {
                            this.speakNextSegment();
                        } else {
                            this.isSpeaking = false;
                            updateStatus('TTS service running. Waiting for AI responses...');
                        }
                    };
                    
                    utterance.onerror = (event) => {
                        console.error('SpeechSynthesis error:', event);
                        updateStatus(\`Error: \${event.error}\`);
                        this.isSpeaking = false;
                    };
                    
                    this.currentUtterance = utterance;
                    this.isSpeaking = true;
                    this.synth.speak(utterance);
                }
                
                pause() {
                    if (this.synth.speaking) {
                        this.synth.pause();
                    }
                }
                
                resume() {
                    if (this.synth.paused) {
                        this.synth.resume();
                    }
                }
                
                stop() {
                    this.textQueue = [];
                    this.synth.cancel();
                    this.isSpeaking = false;
                }
                
                isCurrentlySpeaking() {
                    return this.isSpeaking;
                }
                
                processMessage(element) {
                    if (!element) return;
                    
                    // Extract text content (excluding code blocks if option enabled)
                    const text = this.extractTextContent(element);
                    
                    if (text) {
                        this.speak(text);
                    }
                }
                
                extractTextContent(element) {
                    // Clone the element to work with
                    const clonedElement = element.cloneNode(true);
                    
                    // If filtering code blocks, remove them
                    if (this.filterCodeBlocks) {
                        const codeBlocks = clonedElement.querySelectorAll('pre, code');
                        codeBlocks.forEach(codeBlock => {
                            codeBlock.remove();
                        });
                    }
                    
                    // Get text content
                    return clonedElement.textContent.trim();
                }
            }
            
            // Message handler to communicate with extension
            const vscode = acquireVsCodeApi();
            
            // Status update function
            function updateStatus(message) {
                const statusElement = document.getElementById('status');
                statusElement.textContent = message;
            }
            
            // Initialize TTS service
            const ttsService = new TTSService();
            
            // Send ready message to extension
            vscode.postMessage({ command: 'ready' });
            
            // Listen for messages from the extension
            window.addEventListener('message', event => {
                const message = event.data;
                
                switch (message.command) {
                    case 'speak':
                        ttsService.speak(message.text);
                        break;
                        
                    case 'stop':
                        ttsService.stop();
                        break;
                        
                    case 'updateSettings':
                        if (message.settings.voice) {
                            ttsService.setVoice(message.settings.voice);
                        }
                        if (message.settings.rate !== undefined) {
                            ttsService.setRate(message.settings.rate);
                        }
                        if (message.settings.pitch !== undefined) {
                            ttsService.setPitch(message.settings.pitch);
                        }
                        if (message.settings.filterCodeBlocks !== undefined) {
                            ttsService.setFilterCodeBlocks(message.settings.filterCodeBlocks);
                        }
                        break;
                        
                    case 'setupObserver':
                        // We can't directly observe DOM in VS Code extension, 
                        // but in a real implementation we would set up listeners here
                        updateStatus('TTS ready - simulating observer for AI messages');
                        vscode.postMessage({ 
                            command: 'log',
                            text: 'Observer would be set up with selectors: ' + message.selectors.join(', ')
                        });
                        break;
                }
            });
        </script>
    </body>
    </html>`;
}

// Extension deactivation
export function deactivate() {
    if (ttsPanel) {
        ttsPanel.dispose();
    }
} 