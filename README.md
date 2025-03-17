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

This extension is licensed under the [MIT License](LICENSE).