# Cursor AI TTS Extension

A Visual Studio Code extension that adds Text-to-Speech capabilities to Cursor AI responses, allowing you to listen to AI assistant responses.

## Features

- Automatically reads AI responses using your system's speech synthesis
- Control which voice is used for reading
- Adjust speech rate and pitch
- Option to skip code blocks when reading
- Simple UI to control TTS settings
- Auto-read responses as they arrive
- Easily enable/disable the feature with commands or keyboard shortcuts

## Requirements

- Cursor Editor (built on VS Code)
- A system with speech synthesis support (most modern operating systems)

## Installation

### From VSIX file

1. Download the `.vsix` file from the releases page
2. In VS Code, open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
3. Type "Install from VSIX" and select the command
4. Navigate to the downloaded `.vsix` file and select it

### From source

1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run compile` to compile the extension
4. Run `npm run package` to create a `.vsix` file
5. Follow the steps above to install the `.vsix` file

## Usage

Once installed, the extension will automatically read aloud responses from the Cursor AI assistant. You can control the TTS features using the following commands:

- `Enable Text-to-Speech for AI Responses`: Enable TTS
- `Disable Text-to-Speech for AI Responses`: Disable TTS
- `Toggle Auto-Read for AI Responses`: Turn auto-reading on/off
- `Read Last AI Response`: Manually read the last detected AI response
- `Show Text-to-Speech Settings`: Open settings page

### Keyboard Shortcuts

- `Alt+R`: Read the last AI response
- `Alt+Shift+R`: Toggle auto-read feature on/off

## Extension Settings

This extension contributes the following settings:

- `cursor-ai-tts.enabled`: Enable or disable text-to-speech for AI responses
- `cursor-ai-tts.autoRead`: Automatically read AI responses when detected
- `cursor-ai-tts.voice`: Preferred voice for text-to-speech
- `cursor-ai-tts.rate`: Speech rate (0.5 to 2.0)
- `cursor-ai-tts.pitch`: Speech pitch (0.5 to 2.0)
- `cursor-ai-tts.filterCodeBlocks`: Skip code blocks when reading AI responses

## Chat Interface Integration

To hear responses from the Cursor AI chat interface, you have these options:

### 1. Automatic Integration (Recommended)

- Make sure auto-read is enabled (default setting)
- Use the chat as normal, and responses should be read automatically
- If auto-read isn't working, use `Alt+R` to read the last response
- Toggle auto-read on/off with `Alt+Shift+R`

### 2. Manual Script Injection 

If the automatic integration isn't working, you can manually inject the observer script:

1. Open the developer console in the chat interface (F12 or Right-Click -> Inspect)
2. Paste this script:

   ```javascript
   // Observer for Cursor AI Chat interface
   (function() {
     console.log('[Cursor AI TTS] Setting up chat observer');
     
     // Create a mutation observer to watch for AI responses
     const observer = new MutationObserver(mutations => {
       // Look for AI responses in the chat
       const aiMessages = document.querySelectorAll(
         '.chat-message-ai, .agent-turn, .cursor-chat-message-ai, .claude-message, ' +
         '.message-block[data-message-author-type="ai"], .chat-entry[data-role="assistant"]'
       );
       
       if (aiMessages.length > 0) {
         // Get the last (newest) message
         const lastMessage = aiMessages[aiMessages.length - 1];
         
         // Extract text content
         const messageText = lastMessage.textContent.trim();
         
         if (messageText && messageText.length > 10) {
           console.log('[Cursor AI TTS] Found AI response');
           
           // Send to VS Code extension via vscode.postMessage
           try {
             // Execute the command to send the text to the TTS extension
             // This works because the chat interface is in the VS Code webview context
             window.vscode.postMessage({
               command: 'executeCommand',
               commandId: 'cursor-ai-tts.aiResponseDetected',
               args: [messageText]
             });
             console.log('[Cursor AI TTS] Sent message to extension');
           } catch (e) {
             console.error('[Cursor AI TTS] Error sending message to extension:', e);
           }
         }
       }
     });
     
     // Start observing the document
     observer.observe(document.body, {
       childList: true,
       subtree: true,
       characterData: true
     });
     
     console.log('[Cursor AI TTS] Chat observer started');
   })();
   ```

### 3. Alternative Method

If all else fails, you can manually copy AI responses and trigger reading with `Alt+R`.

## Known Issues

- The extension can't detect all AI responses if their DOM structure changes significantly
- Some voices may not render code terms correctly
- Chat detection may require manual script injection in some cases

## Release Notes

### 0.2.0

- Added auto-read feature for AI responses
- Added keyboard shortcuts for reading and toggling auto-read
- Improved chat detection methods
- Enhanced documentation

### 0.1.0

- Initial release
- Basic TTS functionality for Cursor AI responses
- Settings for controlling voice, rate, pitch, and code block handling

## License

This extension is licensed under the [MIT License](LICENSE)
