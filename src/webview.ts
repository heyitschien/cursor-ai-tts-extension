import * as vscode from 'vscode';
import { getNonce, getWebviewResourceUri } from './utils';

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
    '      \n' +
    '      // Handle messages from extension\n' +
    '      window.addEventListener(\'message\', event => {\n' +
    '        const message = event.data;\n' +
    '        \n' +
    '        switch (message.command) {\n' +
    '          case \'speak\':\n' +
    '            log(\'Received speak command with text length: \' + message.text.length);\n' +
    '            vscode.postMessage({\n' +
    '              command: \'speakText\',\n' +
    '              text: message.text\n' +
    '            });\n' +
    '            break;\n' +
    '            \n' +
    '          case \'updateStatus\':\n' +
    '            updateStatus(message.text);\n' +
    '            break;\n' +
    '            \n' +
    '          case \'readLastResponse\':\n' +
    '            log(\'Received readLastResponse command\');\n' +
    '            vscode.postMessage({\n' +
    '              command: \'readLastResponse\'\n' +
    '            });\n' +
    '            break;\n' +
    '            \n' +
    '          case \'updateSettings\':\n' +
    '            log(\'Received updated settings\');\n' +
    '            currentSettings = message.settings;\n' +
    '            rateSlider.value = currentSettings.rate;\n' +
    '            rateValue.textContent = currentSettings.rate;\n' +
    '            pitchSlider.value = currentSettings.pitch;\n' +
    '            pitchValue.textContent = currentSettings.pitch;\n' +
    '            volumeSlider.value = currentSettings.volume;\n' +
    '            volumeValue.textContent = currentSettings.volume;\n' +
    '            filterCodeCheckbox.checked = currentSettings.filterCodeBlocks;\n' +
    '            selectUserVoice(currentSettings.voice);\n' +
    '            break;\n' +
    '            \n' +
    '          case \'updateVoices\':\n' +
    '            log(\'Received voice update with \' + message.voices.length + \' voices\');\n' +
    '            voices = message.voices;\n' +
    '            updateVoicesList(voices);\n' +
    '            break;\n' +
    '        }\n' +
    '      });\n' +
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