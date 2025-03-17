import * as vscode from 'vscode';
import { getNonce, getWebviewResourceUri } from './utils';

// Add the chat observer script that will be injected into chat panels
export function getChatObserverScript(): string {
  return `
    (function() {
      // Check if observer is already running to avoid duplicates
      if (window.__cursorTTSObserverRunning) return;
      window.__cursorTTSObserverRunning = true;
      
      console.log('[Cursor AI TTS] Chat observer script injected');
      
      // Debug logging function that tries to communicate with extension
      function debugLog(message) {
        console.log('[Cursor AI TTS] ' + message);
        try {
          if (window.vscode) {
            window.vscode.postMessage({
              command: 'debug',
              message: message
            });
          }
        } catch (e) {
          // Silent fail - vscode may not be available
        }
      }
      
      debugLog('Observer script started');
      
      // Setup message handler for communication from extension
      window.addEventListener('message', event => {
        const message = event.data;
        
        if (message && message.command === 'injectObserver') {
          debugLog('Received inject command');
          setupChatObserver(message.selectors || [
            '.chat-message-ai', 
            '.agent-turn', 
            '.cursor-chat-message-ai',
            '.claude-message',
            '.message-block[data-message-author-type="ai"]',
            '.chat-entry[data-role="assistant"]',
            // New selectors for current Cursor UI
            '.ai-message',
            '.ai-response',
            '.claude-ai-message',
            '[data-message-role="assistant"]',
            '[data-testid="ai-response"]',
            '.response-content-wrapper',
            '.ai-response-content',
            '.chat-message-body',
            '.cursor-ai-response'
          ]);
        }
      });
      
      // Function to detect and process AI responses
      function setupChatObserver(selectors) {
        debugLog('Setting up chat observer with selectors: ' + selectors.join(', '));
        
        // Log the current DOM structure to help with debugging
        function logDOM() {
          try {
            const domSnapshot = document.body.innerHTML;
            debugLog('DOM structure sample: ' + domSnapshot.substring(0, 500) + '...');
            
            // Try to find elements with common chat message-related classes
            document.querySelectorAll('[class*="message"], [class*="chat"], [class*="response"], [class*="ai"], [class*="assistant"], [data-*="ai"], [data-*="assistant"]').forEach(el => {
              debugLog('Found potential chat element: ' + el.tagName + ' - Classes: ' + (el.className || 'none') + ' - Data attrs: ' + Object.keys(el.dataset).join(','));
            });
          } catch (e) {
            debugLog('Error logging DOM: ' + e);
          }
        }
        
        // Run DOM logging on startup and periodically
        logDOM();
        setInterval(logDOM, 30000); // Log DOM structure every 30 seconds
        
        // Function to get text content from AI messages
        function extractTextFromNode(node) {
          // Skip if this is a user message
          if (
            node.classList.contains('chat-message-user') || 
            node.classList.contains('chat-entry-user') ||
            node.getAttribute('data-message-author-type') === 'user' ||
            node.getAttribute('data-role') === 'user' ||
            node.getAttribute('data-message-role') === 'user'
          ) {
            return '';
          }
          
          // Add more detailed console logging to debug extraction
          debugLog('Extracting text from node: ' + node.className);
          
          // Clone the node to work with
          const clone = node.cloneNode(true);
          
          // Find and remove code blocks if present (we'll handle them separately)
          const codeBlocks = clone.querySelectorAll('pre, code');
          const codeTexts = [];
          
          codeBlocks.forEach(block => {
            // Optionally capture code text to mention it later
            codeTexts.push('Code block: ' + block.textContent.substring(0, 50) + '...');
            block.textContent = 'Code block removed for speech';
          });
          
          // Extract the text content
          let text = clone.textContent || '';
          
          // Clean up the text
          text = text.replace(/\\s+/g, ' ').trim();
          
          debugLog('Extracted text (' + text.length + ' chars): ' + text.substring(0, 100) + '...');
          
          return text;
        }
        
        // Track processed nodes to avoid duplicates
        const processedNodes = new Set();
        
        // Create a mutation observer to watch for AI responses
        const observer = new MutationObserver(mutations => {
          let newAIMessage = false;
          let messageText = '';
          
          // Check if any selectors match existing elements
          selectors.forEach(selector => {
            try {
              const elements = document.querySelectorAll(selector);
              if (elements.length > 0) {
                debugLog('Found ' + elements.length + ' elements with selector: ' + selector);
                // Get the last (newest) element
                const lastElement = elements[elements.length - 1];
                
                // Skip if we've already processed this node
                if (!processedNodes.has(lastElement)) {
                  processedNodes.add(lastElement);
                  const text = extractTextFromNode(lastElement);
                  if (text && text.length > 10) {  // Avoid empty or very short messages
                    newAIMessage = true;
                    messageText = text;
                    debugLog('Found new AI message with selector: ' + selector);
                  }
                }
              }
            } catch (err) {
              debugLog('Error with selector ' + selector + ': ' + err);
            }
          });
          
          // If we found a new message, send it to the extension
          if (newAIMessage && messageText) {
            debugLog('Sending AI response to extension');
            if (window.vscode) {
              window.vscode.postMessage({
                command: 'aiResponseDetected',
                text: messageText
              });
            }
          }
        });
        
        // Start observing the document
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true
        });
        
        debugLog('Chat observer started');
        
        // Also check for existing messages
        selectors.forEach(selector => {
          try {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
              debugLog('Found ' + elements.length + ' elements with selector: ' + selector);
              // Get the last (newest) element
              const lastElement = elements[elements.length - 1];
              const text = extractTextFromNode(lastElement);
              if (text && text.length > 10) {
                debugLog('Found existing AI message with selector: ' + selector);
                processedNodes.add(lastElement);
                if (window.vscode) {
                  window.vscode.postMessage({
                    command: 'aiResponseDetected',
                    text: text
                  });
                }
              }
            }
          } catch (err) {
            debugLog('Error with selector ' + selector + ': ' + err);
          }
        });

        // Periodically check for new AI messages that might have been missed
        setInterval(() => {
          selectors.forEach(selector => {
            try {
              const elements = document.querySelectorAll(selector);
              if (elements.length > 0) {
                // Check the last element
                const lastElement = elements[elements.length - 1];
                if (!processedNodes.has(lastElement)) {
                  const text = extractTextFromNode(lastElement);
                  if (text && text.length > 10) {
                    debugLog('Found new AI message in periodic check with selector: ' + selector);
                    processedNodes.add(lastElement);
                    if (window.vscode) {
                      window.vscode.postMessage({
                        command: 'aiResponseDetected',
                        text: text
                      });
                    }
                  }
                }
              }
            } catch (err) {
              // Silent fail for interval checks
            }
          });
        }, 5000); // Check every 5 seconds
      }
    })();
  `;
}

export function getWebviewContent(
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  initialSettings: {
    voice: string;
    rate: number;
    pitch: number;
    volume: number;
    filterCodeBlocks: boolean;
  }
): string {
  // No external JS/CSS files needed for this simple UI
  const nonce = getNonce();

  // Add script to try injecting into other webviews if possible
  const injectScript = `
    // Try to inject into other webviews
    window.addEventListener('message', event => {
      const message = event.data;
      if (message && message.command === 'injectIntoOtherWebviews') {
        console.log('[Cursor AI TTS] Received command to inject into other webviews');
        
        // Try to find frames or other webviews
        try {
          // Try to access all frames
          const frames = window.frames;
          for (let i = 0; i < frames.length; i++) {
            try {
              console.log('[Cursor AI TTS] Trying to inject into frame ' + i);
              
              // First try using postMessage
              frames[i].postMessage({
                command: 'injectObserver',
                script: message.script
              }, '*');
              
              // Then try direct script injection if we can access the contentDocument
              try {
                const frame = document.getElementsByTagName('iframe')[i];
                if (frame && frame.contentDocument) {
                  const scriptElement = frame.contentDocument.createElement('script');
                  scriptElement.textContent = message.script;
                  frame.contentDocument.body.appendChild(scriptElement);
                  console.log('[Cursor AI TTS] Successfully injected script into iframe ' + i);
                }
              } catch (frameError) {
                // Silent fail for security restrictions
              }
            } catch (frameError) {
              console.log('[Cursor AI TTS] Error injecting into frame ' + i + ': ' + frameError);
            }
          }
        } catch (error) {
          console.log('[Cursor AI TTS] Error trying to inject into frames: ' + error);
        }
        
        // Also inject directly into this document's chat elements if any
        const script = message.script;
        const scriptElement = document.createElement('script');
        scriptElement.textContent = script;
        document.body.appendChild(scriptElement);
      }
    });
  `;

  return /* html */`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Cursor AI TTS</title>
        <style>
          body {
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
          }
          h1 {
            font-size: 1.5em;
            margin-bottom: 20px;
          }
          .settings-row {
            margin-bottom: 15px;
          }
          label {
            display: block;
            margin-bottom: 5px;
          }
          select, button {
            margin-right: 10px;
            padding: 5px 10px;
          }
          button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            cursor: pointer;
            border-radius: 2px;
          }
          button:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
          /* Slider styling */
          .slider {
            -webkit-appearance: none;
            width: 300px;
            height: 8px;
            border-radius: 5px;  
            background: var(--vscode-widget-shadow);
            outline: none;
          }
          .slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 20px;
            height: 20px;
            border-radius: 50%; 
            background: var(--vscode-button-background);
            cursor: pointer;
          }
          .slider::-moz-range-thumb {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: var(--vscode-button-background);
            cursor: pointer;
          }
          .status {
            margin-top: 20px;
            font-style: italic;
            color: var(--vscode-descriptionForeground);
          }
          .checkbox-row {
            display: flex;
            align-items: center;
            margin-bottom: 15px;
          }
          .checkbox-row input {
            margin-right: 10px;
          }
          .button-row {
            margin-top: 20px;
          }
        </style>
    </head>
    <body>
        <h1>Cursor AI TTS Settings</h1>
        
        <div class="settings-row">
            <label for="voice">Voice:</label>
            <select id="voice"></select>
            <button id="testVoice">Test Voice</button>
            <button id="reloadVoices">Reload Voices</button>
        </div>
        <div id="voiceStatus">Found 0 voices</div>
        
        <div class="settings-row">
            <label for="rate">Rate: <span id="rateValue">1</span></label>
            <input type="range" min="0.5" max="2" step="0.1" class="slider" id="rate" value="${initialSettings.rate}">
        </div>
        
        <div class="settings-row">
            <label for="pitch">Pitch: <span id="pitchValue">1</span></label>
            <input type="range" min="0.5" max="2" step="0.1" class="slider" id="pitch" value="${initialSettings.pitch}">
        </div>
        
        <div class="settings-row">
            <label for="volume">Volume: <span id="volumeValue">1</span></label>
            <input type="range" min="0" max="1" step="0.1" class="slider" id="volume" value="${initialSettings.volume}">
        </div>
        
        <div class="checkbox-row">
            <input type="checkbox" id="filterCodeBlocks" ${initialSettings.filterCodeBlocks ? 'checked' : ''}>
            <label for="filterCodeBlocks">Filter Code Blocks:</label>
        </div>
        
        <div class="button-row">
            <button id="saveSettings">Save Settings</button>
            <button id="stopSpeech">Stop Speech</button>
        </div>
        
        <div class="status" id="status">TTS service started. Waiting for AI responses...</div>
        
        <script nonce="${nonce}">
            // Setup web speech synthesis
            const voices = [];
            const synth = window.speechSynthesis;
            let speaking = false;
            let currentUtterance = null;
            
            // Get UI elements
            const voiceSelect = document.getElementById('voice');
            const testButton = document.getElementById('testVoice');
            const reloadButton = document.getElementById('reloadVoices');
            const rateSlider = document.getElementById('rate');
            const pitchSlider = document.getElementById('pitch');
            const volumeSlider = document.getElementById('volume');
            const rateValue = document.getElementById('rateValue');
            const pitchValue = document.getElementById('pitchValue');
            const volumeValue = document.getElementById('volumeValue');
            const saveButton = document.getElementById('saveSettings');
            const stopButton = document.getElementById('stopSpeech');
            const filterCodeBlocksCheckbox = document.getElementById('filterCodeBlocks');
            const voiceStatus = document.getElementById('voiceStatus');
            const statusElement = document.getElementById('status');
            
            // Initial values
            let selectedVoice = "${initialSettings.voice}";
            let rate = ${initialSettings.rate};
            let pitch = ${initialSettings.pitch};
            let volume = ${initialSettings.volume};
            let filterCodeBlocks = ${initialSettings.filterCodeBlocks};
            
            // Initialize rate and pitch display
            rateValue.textContent = rate;
            pitchValue.textContent = pitch;
            volumeValue.textContent = volume;
            
            // Setup event listeners for sliders
            rateSlider.addEventListener('input', (e) => {
                rate = e.target.value;
                rateValue.textContent = rate;
            });
            
            pitchSlider.addEventListener('input', (e) => {
                pitch = e.target.value;
                pitchValue.textContent = pitch;
            });
            
            volumeSlider.addEventListener('input', (e) => {
                volume = e.target.value;
                volumeValue.textContent = volume;
            });
            
            // Load available voices
            function loadVoices() {
                voices.length = 0;
                const availableVoices = synth.getVoices();
                
                if (availableVoices.length === 0) {
                    voiceStatus.textContent = "No voices found on direct attempt, waiting for voiceschanged event";
                    return;
                }
                
                voiceSelect.innerHTML = '';
                
                // Add default option
                const defaultOption = document.createElement('option');
                defaultOption.textContent = '-- Default Voice --';
                defaultOption.value = '';
                voiceSelect.appendChild(defaultOption);
                
                // Add all available voices
                availableVoices.forEach(voice => {
                    voices.push(voice);
                    const option = document.createElement('option');
                    option.textContent = \`\${voice.name} (\${voice.lang})\`;
                    option.value = voice.name;
                    
                    if (voice.name === selectedVoice) {
                        option.selected = true;
                    }
                    
                    voiceSelect.appendChild(option);
                });
                
                voiceStatus.textContent = \`Found \${voices.length} voices\`;
                
                // Notify extension that voices have been loaded
                vscode.postMessage({
                    command: 'voicesLoaded',
                    count: voices.length
                });
            }
            
            // Initialize voices
            function initVoices() {
                if (synth.onvoiceschanged !== undefined) {
                    synth.onvoiceschanged = loadVoices;
                }
                
                // Try loading voices immediately
                loadVoices();
            }
            
            // Function to speak text
            function speakText(text, force = false) {
                if (!text) return;
                
                // Update status
                statusElement.textContent = 'Speaking...';
                
                // If already speaking and not forced, cancel current speech
                if (speaking && !force) {
                    synth.cancel();
                }
                
                // Process text before speaking
                let processedText = text;
                
                // Apply content filtering if enabled
                if (filterCodeBlocks) {
                    // Replace code blocks with placeholder
                    processedText = processedText.replace(/\`\`\`[\\s\\S]*?\`\`\`/g, 'Code block removed for speech');
                    processedText = processedText.replace(/\`[^\`]+\`/g, 'Inline code removed');
                }
                
                // Create speech utterance
                const utterance = new SpeechSynthesisUtterance(processedText);
                currentUtterance = utterance;
                
                // Set voice if specified
                if (selectedVoice) {
                    const voice = voices.find(v => v.name === selectedVoice);
                    if (voice) {
                        utterance.voice = voice;
                    }
                }
                
                // Set other speech parameters
                utterance.rate = parseFloat(rate);
                utterance.pitch = parseFloat(pitch);
                utterance.volume = parseFloat(volume);
                
                // Add event listeners
                utterance.onstart = () => {
                    speaking = true;
                    statusElement.textContent = 'Speaking...';
                };
                
                utterance.onend = () => {
                    speaking = false;
                    statusElement.textContent = 'Ready for next AI response';
                };
                
                utterance.onerror = (event) => {
                    speaking = false;
                    statusElement.textContent = \`Speech error: \${event.error}\`;
                };
                
                // Start speaking
                synth.speak(utterance);
                
                // Notify extension
                vscode.postMessage({
                    command: 'speakText',
                    text: text
                });
            }
            
            // Handler for test button
            testButton.addEventListener('click', () => {
                const testText = "This is a test of the selected voice and speech settings.";
                speakText(testText, true);
            });
            
            // Handler for reload voices button
            reloadButton.addEventListener('click', () => {
                loadVoices();
                vscode.postMessage({
                    command: 'reloadVoices'
                });
            });
            
            // Handler for stop speech button
            stopButton.addEventListener('click', () => {
                synth.cancel();
                speaking = false;
                statusElement.textContent = 'Speech stopped';
                vscode.postMessage({
                    command: 'stopSpeech'
                });
            });
            
            // Handler for save settings button
            saveButton.addEventListener('click', () => {
                // Get current settings
                selectedVoice = voiceSelect.value;
                rate = rateSlider.value;
                pitch = pitchSlider.value;
                volume = volumeSlider.value;
                filterCodeBlocks = filterCodeBlocksCheckbox.checked;
                
                // Send to extension
                vscode.postMessage({
                    command: 'saveSettings',
                    settings: {
                        voice: selectedVoice,
                        rate: rate,
                        pitch: pitch,
                        volume: volume,
                        filterCodeBlocks: filterCodeBlocks
                    }
                });
                
                statusElement.textContent = 'Settings saved';
            });
            
            // Handle messages from the extension
            window.addEventListener('message', event => {
                const message = event.data;
                
                switch (message.command) {
                    case 'speak':
                        if (!speaking) {
                            speakText(message.text);
                        }
                        break;
                        
                    case 'forceSpeech':
                        speakText(message.text, true);
                        break;
                        
                    case 'stopSpeech':
                        synth.cancel();
                        speaking = false;
                        statusElement.textContent = 'Speech stopped by extension';
                        break;
                        
                    case 'updateSettings':
                        // Update all settings
                        const settings = message.settings;
                        selectedVoice = settings.voice;
                        rate = settings.rate;
                        pitch = settings.pitch;
                        volume = settings.volume || 1.0;
                        filterCodeBlocks = settings.filterCodeBlocks;
                        
                        // Update UI
                        if (selectedVoice) {
                            Array.from(voiceSelect.options).forEach(option => {
                                if (option.value === selectedVoice) {
                                    option.selected = true;
                                }
                            });
                        }
                        
                        rateSlider.value = rate;
                        rateValue.textContent = rate;
                        
                        pitchSlider.value = pitch;
                        pitchValue.textContent = pitch;
                        
                        volumeSlider.value = volume;
                        volumeValue.textContent = volume;
                        
                        filterCodeBlocksCheckbox.checked = filterCodeBlocks;
                        
                        statusElement.textContent = 'Settings updated from extension';
                        break;
                }
            });
            
            // Initialize
            initVoices();
            
            // Notify extension that webview is ready
            vscode.postMessage({
                command: 'webviewReady'
            });
            
            ${injectScript}
        </script>
    </body>
    </html>`;
} 