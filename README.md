# Cursor AI TTS Extension

A Visual Studio Code extension that adds Text-to-Speech capabilities to Cursor AI responses, allowing you to listen to AI assistant responses.

## Features

- Automatically reads AI responses using your system's speech synthesis
- Control which voice is used for reading
- Adjust speech rate and pitch
- Option to skip code blocks when reading
- Simple UI to control TTS settings
- Easily enable/disable the feature with commands

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
- `Show Text-to-Speech Settings`: Open settings page

## Extension Settings

This extension contributes the following settings:

- `cursor-ai-tts.enabled`: Enable or disable text-to-speech for AI responses
- `cursor-ai-tts.voice`: Preferred voice for text-to-speech
- `cursor-ai-tts.rate`: Speech rate (0.5 to 2.0)
- `cursor-ai-tts.pitch`: Speech pitch (0.5 to 2.0)
- `cursor-ai-tts.filterCodeBlocks`: Skip code blocks when reading AI responses

## Known Issues

- The extension can't detect all AI responses if their DOM structure changes significantly
- Some voices may not render code terms correctly

## Release Notes

### 0.1.0

- Initial release
- Basic TTS functionality for Cursor AI responses
- Settings for controlling voice, rate, pitch, and code block handling

## License

This extension is licensed under the [MIT License](LICENSE)

## Chat Interface Integration

To hear responses from the Cursor AI chat interface, you can create a custom script to send AI responses to the TTS extension. Here's how:

1. **Create a Script in the Chat Browser Environment:**
   Open the developer console in the chat interface (F12 or Right-Click -> Inspect) and paste this script:

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

2. **Alternative Method for Chat Detection:**
   If the above script doesn't work, you can manually copy AI responses and use the "Read Last AI Response" command from the command palette.

3. **Requesting Extension API Access:**
   We're working on better integration with the Cursor AI chat interface. Future versions may include direct integration without requiring custom scripts.
