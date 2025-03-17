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
      
      // Setup message handler for communication from extension
      window.addEventListener('message', event => {
        const message = event.data;
        
        if (message && message.command === 'injectObserver') {
          setupChatObserver(message.selectors || [
            '.chat-message-ai', 
            '.agent-turn', 
            '.cursor-chat-message-ai',
            '.claude-message',
            '.message-block[data-message-author-type="ai"]',
            '.chat-entry[data-role="assistant"]'
          ]);
        }
      });
      
      // Function to detect and process AI responses
      function setupChatObserver(selectors) {
        console.log('[Cursor AI TTS] Setting up chat observer with selectors:', selectors);
        
        // Function to get text content from AI messages
        function extractTextFromNode(node) {
          // Skip if this is a user message
          if (
            node.classList.contains('chat-message-user') || 
            node.classList.contains('chat-entry-user') ||
            node.getAttribute('data-message-author-type') === 'user' ||
            node.getAttribute('data-role') === 'user'
          ) {
            return '';
          }
          
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
                // Get the last (newest) element
                const lastElement = elements[elements.length - 1];
                
                // Skip if we've already processed this node
                if (!processedNodes.has(lastElement)) {
                  processedNodes.add(lastElement);
                  const text = extractTextFromNode(lastElement);
                  if (text && text.length > 10) {  // Avoid empty or very short messages
                    newAIMessage = true;
                    messageText = text;
                    console.log('[Cursor AI TTS] Found new AI message with selector: ' + selector);
                  }
                }
              }
            } catch (err) {
              console.error('[Cursor AI TTS] Error with selector ' + selector, err);
            }
          });
          
          // If we found a new message, send it to the extension
          if (newAIMessage && messageText) {
            console.log('[Cursor AI TTS] Sending AI response to extension');
            window.vscode.postMessage({
              command: 'aiResponseDetected',
              text: messageText
            });
          }
        });
        
        // Start observing the document
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true
        });
        
        console.log('[Cursor AI TTS] Chat observer started');
        
        // Also check for existing messages
        selectors.forEach(selector => {
          try {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
              // Get the last (newest) element
              const lastElement = elements[elements.length - 1];
              const text = extractTextFromNode(lastElement);
              if (text && text.length > 10) {
                console.log('[Cursor AI TTS] Found existing AI message with selector: ' + selector);
                processedNodes.add(lastElement);
                window.vscode.postMessage({
                  command: 'aiResponseDetected',
                  text: text
                });
              }
            }
          } catch (err) {
            console.error('[Cursor AI TTS] Error with selector ' + selector, err);
          }
        });
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
  const nonce = getNonce();

  // Add the forceSpeech function to the webview script
  const forceSpeechFunction = `
    // Force speech function for reliable TTS
    function forceSpeech(text) {
      try {
        log('Force speech called with text length: ' + text.length);
        requestAudioPermissions();
        
        // Process text if filtering is enabled
        const processedText = filterCodeCheckbox.checked ? 
          text.replace(/\`\`\`[\\s\\S]*?\`\`\`/g, 'Code block skipped.').replace(/\`[^\`]+\`/g, 'Inline code skipped.') : 
          text;
        
        // Create utterance
        const utterance = new SpeechSynthesisUtterance(processedText);
        
        // Set voice if selected
        if (voiceSelect.value) {
          const voice = voices.find(v => v.name === voiceSelect.value);
          if (voice) {
            utterance.voice = voice;
            log('Using voice: ' + voice.name);
          } else {
            log('Selected voice not found: ' + voiceSelect.value);
          }
        }
        
        // If still no voice set and we have voices available, use first one
        if (!utterance.voice && voices.length > 0) {
          utterance.voice = voices[0];
          log('Using default voice: ' + voices[0].name);
        }
        
        // Set speech properties
        utterance.rate = parseFloat(rateSlider.value);
        utterance.pitch = parseFloat(pitchSlider.value);
        utterance.volume = parseFloat(volumeSlider.value);
        
        // Set event handlers
        utterance.onstart = () => log('Force speech started');
        utterance.onend = () => log('Force speech ended');
        utterance.onerror = (event) => log('Force speech error: ' + event.error);
        
        // Cancel any ongoing speech
        synth.cancel();
        
        // If text is long, break into smaller chunks
        if (processedText.length > 500) {
          const chunks = processedText.match(/[^.!?]+[.!?]+/g) || [processedText];
          log('Breaking long text into ' + chunks.length + ' chunks');
          
          // Speak first chunk and set up queue for the rest
          let currentChunk = 0;
          const speakNextChunk = () => {
            if (currentChunk < chunks.length) {
              const chunkUtterance = new SpeechSynthesisUtterance(chunks[currentChunk]);
              if (utterance.voice) chunkUtterance.voice = utterance.voice;
              chunkUtterance.rate = utterance.rate;
              chunkUtterance.pitch = utterance.pitch;
              chunkUtterance.volume = utterance.volume;
              chunkUtterance.onend = () => {
                currentChunk++;
                speakNextChunk();
              };
              log('Speaking chunk ' + (currentChunk + 1) + ' of ' + chunks.length);
              synth.speak(chunkUtterance);
            }
          };
          
          speakNextChunk();
        } else {
          // For shorter text, just speak directly
          synth.speak(utterance);
        }
        
        return true;
      } catch (e) {
        log('Error in forceSpeech: ' + e.message);
        return false;
      }
    }
  `;

  // Update handleMessages to include the forceSpeech case
  const messageHandlerCode = `
    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;
      
      switch (message.command) {
        case 'speak':
          log('Received speak command with text length: ' + message.text.length);
          vscode.postMessage({
            command: 'speakText',
            text: message.text
          });
          break;
          
        case 'forceSpeech':
          log('Received forceSpeech command with text length: ' + message.text.length);
          forceSpeech(message.text);
          break;
          
        case 'updateStatus':
          updateStatus(message.text);
          break;
          
        case 'readLastResponse':
          log('Received readLastResponse command');
          vscode.postMessage({
            command: 'readLastResponse'
          });
          break;
          
        case 'updateSettings':
          log('Received updated settings');
          currentSettings = message.settings;
          rateSlider.value = currentSettings.rate;
          rateValue.textContent = currentSettings.rate;
          pitchSlider.value = currentSettings.pitch;
          pitchValue.textContent = currentSettings.pitch;
          volumeSlider.value = currentSettings.volume;
          volumeValue.textContent = currentSettings.volume;
          filterCodeCheckbox.checked = currentSettings.filterCodeBlocks;
          selectUserVoice(currentSettings.voice);
          break;
          
        case 'updateVoices':
          log('Received voice update with ' + message.voices.length + ' voices');
          voices = message.voices;
          updateVoicesList(voices);
          break;
      }
    });
  `;

  // Add debug functionality to track visibility issues
  return '<!DOCTYPE html>\n' +
    '<html lang="en">\n' +
    '<head>\n' +
    '  <meta charset="UTF-8">\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '  <meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'nonce-' + nonce + '\'; style-src ' + webview.cspSource + ';">\n' +
    '  <title>Cursor AI TTS</title>\n' +
    '  <style>\n' +
    '    body {\n' +
    '      font-family: var(--vscode-font-family);\n' +
    '      padding: 10px;\n' +
    '      color: var(--vscode-foreground);\n' +
    '      background-color: var(--vscode-editor-background);\n' +
    '    }\n' +
    '    .container {\n' +
    '      display: flex;\n' +
    '      flex-direction: column;\n' +
    '      gap: 10px;\n' +
    '    }\n' +
    '    .row {\n' +
    '      display: flex;\n' +
    '      flex-direction: row;\n' +
    '      align-items: center;\n' +
    '      justify-content: space-between;\n' +
    '      gap: 10px;\n' +
    '    }\n' +
    '    label {\n' +
    '      flex: 1;\n' +
    '    }\n' +
    '    select, button, input {\n' +
    '      background-color: var(--vscode-button-background);\n' +
    '      color: var(--vscode-button-foreground);\n' +
    '      border: none;\n' +
    '      padding: 4px 8px;\n' +
    '      border-radius: 2px;\n' +
    '    }\n' +
    '    button:hover {\n' +
    '      background-color: var(--vscode-button-hoverBackground);\n' +
    '      cursor: pointer;\n' +
    '    }\n' +
    '    button:active {\n' +
    '      background-color: var(--vscode-button-pressedBackground);\n' +
    '    }\n' +
    '    input[type="range"] {\n' +
    '      flex: 2;\n' +
    '    }\n' +
    '    .status {\n' +
    '      margin-top: 10px;\n' +
    '      padding: 5px;\n' +
    '      border-top: 1px solid var(--vscode-editorWidget-border);\n' +
    '      background-color: var(--vscode-editorWidget-background);\n' +
    '      white-space: pre-wrap;\n' +
    '      max-height: 200px;\n' +
    '      overflow-y: auto;\n' +
    '    }\n' +
    '    .log {\n' +
    '      font-family: var(--vscode-editor-font-family);\n' +
    '      font-size: var(--vscode-editor-font-size);\n' +
    '      max-height: 150px;\n' +
    '      overflow-y: auto;\n' +
    '      border: 1px solid var(--vscode-editorWidget-border);\n' +
    '      padding: 5px;\n' +
    '      margin-top: 5px;\n' +
    '      background-color: var(--vscode-editorWidget-background);\n' +
    '      white-space: pre-wrap;\n' +
    '    }\n' +
    '    .controls {\n' +
    '      display: flex;\n' +
    '      gap: 5px;\n' +
    '    }\n' +
    '    select {\n' +
    '      max-width: 250px;\n' +
    '      width: 100%;\n' +
    '    }\n' +
    '    .hidden {\n' +
    '      display: none;\n' +
    '    }\n' +
    '    .debug-section {\n' +
    '      margin-top: 20px;\n' +
    '      border-top: 1px dashed var(--vscode-editorWidget-border);\n' +
    '      padding-top: 10px;\n' +
    '    }\n' +
    '    .voice-debug {\n' +
    '      margin-top: 5px;\n' +
    '      font-size: 0.8em;\n' +
    '      color: var(--vscode-descriptionForeground);\n' +
    '    }\n' +
    '  </style>\n' +
    '</head>\n' +
    '<body>\n' +
    '  <div class="container">\n' +
    '    <h3>Cursor AI TTS Settings</h3>\n' +
    '    \n' +
    '    <div class="row">\n' +
    '      <label for="voice-select">Voice:</label>\n' +
    '      <select id="voice-select" title="Select voice for text-to-speech"></select>\n' +
    '      <button id="test-voice">Test Voice</button>\n' +
    '      <button id="reload-voices">Reload Voices</button>\n' +
    '    </div>\n' +
    '    \n' +
    '    <div class="voice-debug" id="voice-debug">Loading voices...</div>\n' +
    '    \n' +
    '    <div class="row">\n' +
    '      <label for="rate-slider">Rate:</label>\n' +
    '      <input type="range" id="rate-slider" min="0.5" max="2" step="0.1" value="' + initialSettings.rate + '">\n' +
    '      <span id="rate-value">' + initialSettings.rate + '</span>\n' +
    '    </div>\n' +
    '    \n' +
    '    <div class="row">\n' +
    '      <label for="pitch-slider">Pitch:</label>\n' +
    '      <input type="range" id="pitch-slider" min="0.5" max="2" step="0.1" value="' + initialSettings.pitch + '">\n' +
    '      <span id="pitch-value">' + initialSettings.pitch + '</span>\n' +
    '    </div>\n' +
    '    \n' +
    '    <div class="row">\n' +
    '      <label for="volume-slider">Volume:</label>\n' +
    '      <input type="range" id="volume-slider" min="0" max="1" step="0.1" value="' + (initialSettings.volume || 1.0) + '">\n' +
    '      <span id="volume-value">' + (initialSettings.volume || 1.0) + '</span>\n' +
    '    </div>\n' +
    '    \n' +
    '    <div class="row">\n' +
    '      <label for="filter-code">Filter Code Blocks:</label>\n' +
    '      <input type="checkbox" id="filter-code" ' + (initialSettings.filterCodeBlocks ? 'checked' : '') + '>\n' +
    '    </div>\n' +
    '    \n' +
    '    <div class="controls">\n' +
    '      <button id="settings-save">Save Settings</button>\n' +
    '      <button id="stop-speech">Stop Speech</button>\n' +
    '    </div>\n' +
    '    \n' +
    '    <div class="status" id="status">TTS service starting...</div>\n' +
    '    \n' +
    '    <div class="debug-section">\n' +
    '      <h4>Debug Information</h4>\n' +
    '      <div class="log" id="log"></div>\n' +
    '    </div>\n' +
    '  </div>\n' +
    '\n' +
    '  <script nonce="' + nonce + '">\n' +
    '    (function() {\n' +
    '      // Initialize variables\n' +
    '      const vscode = acquireVsCodeApi();\n' +
    '      const voiceSelect = document.getElementById(\'voice-select\');\n' +
    '      const testVoiceButton = document.getElementById(\'test-voice\');\n' +
    '      const reloadVoicesButton = document.getElementById(\'reload-voices\');\n' +
    '      const rateSlider = document.getElementById(\'rate-slider\');\n' +
    '      const rateValue = document.getElementById(\'rate-value\');\n' +
    '      const pitchSlider = document.getElementById(\'pitch-slider\');\n' +
    '      const pitchValue = document.getElementById(\'pitch-value\');\n' +
    '      const volumeSlider = document.getElementById(\'volume-slider\');\n' +
    '      const volumeValue = document.getElementById(\'volume-value\');\n' +
    '      const filterCodeCheckbox = document.getElementById(\'filter-code\');\n' +
    '      const saveButton = document.getElementById(\'settings-save\');\n' +
    '      const stopButton = document.getElementById(\'stop-speech\');\n' +
    '      const statusDiv = document.getElementById(\'status\');\n' +
    '      const logDiv = document.getElementById(\'log\');\n' +
    '      const voiceDebugDiv = document.getElementById(\'voice-debug\');\n' +
    '      \n' +
    '      // Track visibility state\n' +
    '      let documentVisible = true;\n' +
    '      let initialVoiceLoad = true;\n' +
    '      let voiceLoadAttempts = 0;\n' +
    '      \n' +
    '      // Settings\n' +
    '      let currentSettings = {\n' +
    '        voice: "' + initialSettings.voice + '",\n' +
    '        rate: ' + initialSettings.rate + ',\n' +
    '        pitch: ' + initialSettings.pitch + ',\n' +
    '        volume: ' + (initialSettings.volume || 1.0) + ',\n' +
    '        filterCodeBlocks: ' + initialSettings.filterCodeBlocks + '\n' +
    '      };\n' +
    '      \n' +
    '      // Logging function\n' +
    '      function log(message) {\n' +
    '        console.log(message);\n' +
    '        logDiv.textContent = message + \'\\n\' + logDiv.textContent;\n' +
    '        \n' +
    '        // Keep log from getting too long\n' +
    '        if (logDiv.textContent.length > 5000) {\n' +
    '          logDiv.textContent = logDiv.textContent.substring(0, 5000);\n' +
    '        }\n' +
    '      }\n' +
    '      \n' +
    '      // Update status display\n' +
    '      function updateStatus(message) {\n' +
    '        statusDiv.textContent = message;\n' +
    '        log(message);\n' +
    '      }\n' +
    '      \n' +
    '      // Speech synthesis setup\n' +
    '      const synth = window.speechSynthesis;\n' +
    '      let voices = [];\n' +
    '      \n' +
    '      // Initialize voices with retry mechanism\n' +
    '      function initVoices() {\n' +
    '        log(\'Initializing voices...\');\n' +
    '        loadVoices();\n' +
    '        \n' +
    '        // Set a timer to check voices periodically\n' +
    '        const voiceCheckInterval = setInterval(() => {\n' +
    '          voiceLoadAttempts++;\n' +
    '          log(\'Voice load attempt #\' + voiceLoadAttempts);\n' +
    '          \n' +
    '          if (voiceSelect.options.length > 1 || voiceLoadAttempts > 10) {\n' +
    '            clearInterval(voiceCheckInterval);\n' +
    '            return;\n' +
    '          }\n' +
    '          \n' +
    '          loadVoices();\n' +
    '        }, 1000);\n' +
    '      }\n' +
    '      \n' +
    '      function requestAudioPermissions() {\n' +
    '        try {\n' +
    '          log(\'Requesting audio permissions...\');\n' +
    '          const audioContext = new AudioContext();\n' +
    '          const oscillator = audioContext.createOscillator();\n' +
    '          oscillator.frequency.value = 0; // Silent\n' +
    '          oscillator.connect(audioContext.destination);\n' +
    '          oscillator.start();\n' +
    '          oscillator.stop(audioContext.currentTime + 0.01);\n' +
    '          \n' +
    '          setTimeout(() => {\n' +
    '            audioContext.close();\n' +
    '            log(\'Audio context closed after permission request\');\n' +
    '          }, 100);\n' +
    '          \n' +
    '          return true;\n' +
    '        } catch (e) {\n' +
    '          log(\'Error requesting audio permissions: \' + e.message);\n' +
    '          return false;\n' +
    '        }\n' +
    '      }\n' +
    '      \n' +
    '      // Load available voices\n' +
    '      function loadVoices() {\n' +
    '        try {\n' +
    '          log(\'Loading voices...\');\n' +
    '          // Add debug info\n' +
    '          const availableVoices = synth.getVoices();\n' +
    '          \n' +
    '          if (availableVoices && availableVoices.length > 0) {\n' +
    '            voices = availableVoices;\n' +
    '            updateVoicesList(voices);\n' +
    '            log(\'Loaded \' + voices.length + \' voices directly\');\n' +
    '            voiceDebugDiv.textContent = \'Found \' + voices.length + \' voices\';\n' +
    '            \n' +
    '            // If this is initial load and we have the user\'s preferred voice,\n' +
    '            // make sure it\'s selected\n' +
    '            if (initialVoiceLoad && currentSettings.voice) {\n' +
    '              selectUserVoice(currentSettings.voice);\n' +
    '              initialVoiceLoad = false;\n' +
    '            }\n' +
    '          } else {\n' +
    '            log(\'No voices found on direct attempt, waiting for voiceschanged event\');\n' +
    '            voiceDebugDiv.textContent = \'Waiting for voices to load...\';\n' +
    '          }\n' +
    '        } catch (e) {\n' +
    '          log(\'Error loading voices: \' + e.message);\n' +
    '          voiceDebugDiv.textContent = \'Error loading voices: \' + e.message;\n' +
    '        }\n' +
    '      }\n' +
    '      \n' +
    '      // Update the voice select dropdown\n' +
    '      function updateVoicesList(voiceList) {\n' +
    '        // Clear existing options first (except default)\n' +
    '        while (voiceSelect.options.length > 0) {\n' +
    '          voiceSelect.remove(0);\n' +
    '        }\n' +
    '        \n' +
    '        // Add default option\n' +
    '        const defaultOption = document.createElement(\'option\');\n' +
    '        defaultOption.textContent = \'-- Default Voice --\';\n' +
    '        defaultOption.value = \'\';\n' +
    '        voiceSelect.appendChild(defaultOption);\n' +
    '        \n' +
    '        // Add each voice as an option\n' +
    '        voiceList.forEach(voice => {\n' +
    '          const option = document.createElement(\'option\');\n' +
    '          option.textContent = voice.name + \' (\' + voice.lang + \')\';\n' +
    '          option.value = voice.name;\n' +
    '          \n' +
    '          // Check if this should be selected based on saved preference\n' +
    '          if (voice.name === currentSettings.voice) {\n' +
    '            option.selected = true;\n' +
    '          }\n' +
    '          \n' +
    '          voiceSelect.appendChild(option);\n' +
    '        });\n' +
    '        \n' +
    '        // Update debug info\n' +
    '        voiceDebugDiv.textContent = \'Found \' + voiceList.length + \' voices\';\n' +
    '        \n' +
    '        // Notify extension that voices are loaded\n' +
    '        vscode.postMessage({\n' +
    '          command: \'voicesLoaded\',\n' +
    '          count: voiceList.length\n' +
    '        });\n' +
    '      }\n' +
    '      \n' +
    '      // Select user\'s preferred voice if available\n' +
    '      function selectUserVoice(voiceName) {\n' +
    '        for (let i = 0; i < voiceSelect.options.length; i++) {\n' +
    '          if (voiceSelect.options[i].value === voiceName) {\n' +
    '            voiceSelect.selectedIndex = i;\n' +
    '            log(\'Selected saved voice: \' + voiceName);\n' +
    '            return;\n' +
    '          }\n' +
    '        }\n' +
    '        log(\'Could not find saved voice: \' + voiceName);\n' +
    '      }\n' +
    '      \n' +
    '      // Handle voiceschanged event\n' +
    '      synth.onvoiceschanged = () => {\n' +
    '        const updatedVoices = synth.getVoices();\n' +
    '        log(\'voiceschanged event fired, found \' + updatedVoices.length + \' voices\');\n' +
    '        voices = updatedVoices;\n' +
    '        updateVoicesList(voices);\n' +
    '        \n' +
    '        // If this is initial load and we have the user\'s preferred voice,\n' +
    '        // make sure it\'s selected\n' +
    '        if (initialVoiceLoad && currentSettings.voice) {\n' +
    '          selectUserVoice(currentSettings.voice);\n' +
    '          initialVoiceLoad = false;\n' +
    '        }\n' +
    '      };\n' +
    '      \n' +
    '      // Test the selected voice\n' +
    '      function testVoice() {\n' +
    '        // Request audio permissions first\n' +
    '        requestAudioPermissions();\n' +
    '        \n' +
    '        const selectedVoice = voiceSelect.value;\n' +
    '        log(\'Testing voice: \' + (selectedVoice || \'default\'));\n' +
    '        \n' +
    '        const testText = "This is a test of the text-to-speech system.";\n' +
    '        const utterance = new SpeechSynthesisUtterance(testText);\n' +
    '        \n' +
    '        if (selectedVoice) {\n' +
    '          const voice = voices.find(v => v.name === selectedVoice);\n' +
    '          if (voice) {\n' +
    '            utterance.voice = voice;\n' +
    '            log(\'Selected voice: \' + voice.name);\n' +
    '          } else {\n' +
    '            log(\'Voice not found: \' + selectedVoice);\n' +
    '          }\n' +
    '        }\n' +
    '        \n' +
    '        utterance.rate = parseFloat(rateSlider.value);\n' +
    '        utterance.pitch = parseFloat(pitchSlider.value);\n' +
    '        utterance.volume = parseFloat(volumeSlider.value);\n' +
    '        \n' +
    '        utterance.onstart = () => log(\'Test speech started\');\n' +
    '        utterance.onend = () => log(\'Test speech ended\');\n' +
    '        utterance.onerror = (event) => log(\'Test speech error: \' + event.error);\n' +
    '        \n' +
    '        synth.cancel(); // Cancel any ongoing speech\n' +
    '        synth.speak(utterance);\n' +
    '      }\n' +
    forceSpeechFunction +
    '      \n' +
    '      // Save settings back to extension configuration\n' +
    '      function saveSettings() {\n' +
    '        currentSettings = {\n' +
    '          voice: voiceSelect.value,\n' +
    '          rate: parseFloat(rateSlider.value),\n' +
    '          pitch: parseFloat(pitchSlider.value),\n' +
    '          volume: parseFloat(volumeSlider.value),\n' +
    '          filterCodeBlocks: filterCodeCheckbox.checked\n' +
    '        };\n' +
    '        \n' +
    '        log(\'Saving settings: \' + JSON.stringify(currentSettings));\n' +
    '        \n' +
    '        vscode.postMessage({\n' +
    '          command: \'saveSettings\',\n' +
    '          settings: currentSettings\n' +
    '        });\n' +
    '      }\n' +
    messageHandlerCode +
    '      \n' +
    '      // UI event handlers\n' +
    '      testVoiceButton.addEventListener(\'click\', testVoice);\n' +
    '      \n' +
    '      reloadVoicesButton.addEventListener(\'click\', () => {\n' +
    '        log(\'Manually reloading voices...\');\n' +
    '        voiceLoadAttempts = 0;\n' +
    '        voiceDebugDiv.textContent = \'Reloading voices...\';\n' +
    '        loadVoices();\n' +
    '        \n' +
    '        // Also notify extension to try reloading voices\n' +
    '        vscode.postMessage({\n' +
    '          command: \'reloadVoices\'\n' +
    '        });\n' +
    '      });\n' +
    '      \n' +
    '      rateSlider.addEventListener(\'input\', () => {\n' +
    '        rateValue.textContent = rateSlider.value;\n' +
    '      });\n' +
    '      \n' +
    '      pitchSlider.addEventListener(\'input\', () => {\n' +
    '        pitchValue.textContent = pitchSlider.value;\n' +
    '      });\n' +
    '      \n' +
    '      volumeSlider.addEventListener(\'input\', () => {\n' +
    '        volumeValue.textContent = volumeSlider.value;\n' +
    '      });\n' +
    '      \n' +
    '      saveButton.addEventListener(\'click\', saveSettings);\n' +
    '      \n' +
    '      stopButton.addEventListener(\'click\', () => {\n' +
    '        log(\'Stopping speech\');\n' +
    '        synth.cancel();\n' +
    '        vscode.postMessage({\n' +
    '          command: \'stopSpeech\'\n' +
    '        });\n' +
    '      });\n' +
    '      \n' +
    '      // Track visibility for debugging focus issues\n' +
    '      document.addEventListener(\'visibilitychange\', () => {\n' +
    '        documentVisible = !document.hidden;\n' +
    '        log(\'Document visibility changed: \' + (documentVisible ? \'visible\' : \'hidden\'));\n' +
    '        \n' +
    '        if (documentVisible && voiceSelect.options.length <= 1) {\n' +
    '          log(\'Document became visible, reloading voices\');\n' +
    '          loadVoices();\n' +
    '        }\n' +
    '      });\n' +
    '      \n' +
    '      // Initialize on load\n' +
    '      window.addEventListener(\'load\', () => {\n' +
    '        log(\'WebView loaded\');\n' +
    '        updateStatus(\'TTS service started. Waiting for AI responses...\');\n' +
    '        initVoices();\n' +
    '        requestAudioPermissions();\n' +
    '      });\n' +
    '      \n' +
    '      // Send ready message back to extension\n' +
    '      vscode.postMessage({\n' +
    '        command: \'webviewReady\'\n' +
    '      });\n' +
    '    })();\n' +
    '  </script>\n' +
    '</body>\n' +
    '</html>';
} 