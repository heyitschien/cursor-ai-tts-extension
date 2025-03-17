import * as vscode from 'vscode';
import { getWebviewContent, getChatObserverScript } from './webview';
import { getConfiguration, logDebug, showInfo } from './utils';

// Store global state
let ttsEnabled = true;
let ttsPanel: vscode.WebviewPanel | undefined;
let lastAIResponseText: string = '';

// Extension activation - called when the extension is activated
export function activate(context: vscode.ExtensionContext) {
    logDebug('Cursor AI TTS extension is now active');

    // Load configuration
    const config = getConfiguration();
    ttsEnabled = config.get('enabled') as boolean;

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('cursor-ai-tts.enable', () => {
            ttsEnabled = true;
            getConfiguration().update('enabled', true, true);
            showInfo('Text-to-Speech for AI responses enabled');
            ensureTTSPanelExists(context);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cursor-ai-tts.disable', () => {
            ttsEnabled = false;
            getConfiguration().update('enabled', false, true);
            showInfo('Text-to-Speech for AI responses disabled');
            disposeTTSPanel();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cursor-ai-tts.showSettings', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'cursor-ai-tts');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cursor-ai-tts.readLastResponse', () => {
            // Try to get text from the last AI response
            if (lastAIResponseText) {
                if (ttsPanel) {
                    // Use the forceSpeech method
                    ttsPanel.webview.postMessage({
                        command: 'forceSpeech',
                        text: lastAIResponseText
                    });
                } else if (ttsEnabled) {
                    ensureTTSPanelExists(context);
                    // Delay to ensure panel is created before sending command
                    setTimeout(() => {
                        if (ttsPanel) {
                            ttsPanel.webview.postMessage({
                                command: 'forceSpeech',
                                text: lastAIResponseText
                            });
                        }
                    }, 1000);
                }
            } else {
                // Show a message to the user
                showInfo('No AI response detected. Try sending a message to the AI assistant first.');
            }
        })
    );

    // Register a command to receive AI responses from chat interface
    context.subscriptions.push(
        vscode.commands.registerCommand('cursor-ai-tts.aiResponseDetected', (text: string) => {
            if (text && text.length > 10) {
                logDebug(`Received AI response from chat interface: ${text.substring(0, 50)}...`);
                lastAIResponseText = text;
                
                // If TTS is enabled and we have a panel, speak it
                if (ttsEnabled && ttsPanel) {
                    ttsPanel.webview.postMessage({
                        command: 'forceSpeech',
                        text: text
                    });
                }
            }
        })
    );

    // Start listening for AI assistant responses and initialize the TTS panel if enabled
    if (ttsEnabled) {
        ensureTTSPanelExists(context);
    }

    // Listen for text document changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
            if (!ttsEnabled || !ttsPanel) {
                return;
            }

            // Check for Cursor AI responses
            const changes = event.contentChanges;
            if (changes.length === 0) {
                return;
            }

            try {
                // Look for changes that might be AI responses
                for (const change of changes) {
                    const changedText = change.text;
                    
                    // Skip very short changes that are unlikely to be AI responses
                    if (changedText.length < 5) {
                        continue;
                    }

                    // Check for certain patterns that might indicate an AI response
                    // This is a heuristic and might need adjustment
                    if (
                        // Look for complete sentences ending with periods
                        (changedText.includes('. ') && changedText.length > 100) ||
                        // Look for markdown-style code blocks
                        (changedText.includes('```') && changedText.includes('\n')) ||
                        // Look for bullet points common in AI responses
                        (changedText.includes('* ') && changedText.includes('\n')) ||
                        // Look for numbered lists common in AI responses
                        (/\d+\.\s/.test(changedText) && changedText.includes('\n'))
                    ) {
                        // This looks like it might be an AI response
                        lastAIResponseText = changedText;
                        
                        // Send to TTS panel
                        if (ttsPanel) {
                            ttsPanel.webview.postMessage({
                                command: 'speak',
                                text: changedText
                            });
                        }
                        
                        // Only process one likely AI response per change event
                        break;
                    }
                }
            } catch (error) {
                logDebug(`Error processing text change: ${error}`);
            }
        })
    );

    // Track when the active editor changes
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                logDebug(`Active editor changed: ${editor.document.uri}`);
            }
        })
    );
}

// Function to create or show the TTS panel
function ensureTTSPanelExists(context: vscode.ExtensionContext): void {
    if (ttsPanel) {
        ttsPanel.reveal(vscode.ViewColumn.Beside);
        return;
    }

    // Create new panel
    ttsPanel = vscode.window.createWebviewPanel(
        'cursorAiTts',
        'Cursor AI TTS',
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    // Get configuration for initial settings
    const config = getConfiguration();
    const initialSettings = {
        voice: config.get('voice') as string,
        rate: config.get('rate') as number,
        pitch: config.get('pitch') as number,
        volume: 1.0, // Default volume
        filterCodeBlocks: config.get('filterCodeBlocks') as boolean
    };

    // Set panel HTML content
    ttsPanel.webview.html = getWebviewContent(ttsPanel.webview, context, initialSettings);

    // Handle messages from the webview
    ttsPanel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'webviewReady':
                    logDebug('WebView is ready');
                    break;

                case 'speakText':
                    logDebug(`Speaking text: ${message.text.substring(0, 50)}...`);
                    break;

                case 'voicesLoaded':
                    logDebug(`Voices loaded: ${message.count}`);
                    break;

                case 'saveSettings':
                    saveSettings(message.settings);
                    break;

                case 'readLastResponse':
                    if (lastAIResponseText) {
                        ttsPanel?.webview.postMessage({
                            command: 'speak',
                            text: lastAIResponseText
                        });
                    } else {
                        showInfo('No AI response detected yet. Try sending a message to the AI assistant first.');
                    }
                    break;

                case 'stopSpeech':
                    logDebug('Stopping speech');
                    break;

                case 'reloadVoices':
                    logDebug('Reloading voices');
                    break;
            }
        },
        undefined,
        context.subscriptions
    );

    // When the panel is disposed, remove the reference
    ttsPanel.onDidDispose(
        () => {
            ttsPanel = undefined;
        },
        null,
        context.subscriptions
    );
}

// Function to save user settings
function saveSettings(settings: any): void {
    try {
        const config = getConfiguration();
        
        // Update each setting
        config.update('voice', settings.voice, true);
        config.update('rate', settings.rate, true);
        config.update('pitch', settings.pitch, true);
        config.update('filterCodeBlocks', settings.filterCodeBlocks, true);
        
        showInfo('Text-to-Speech settings saved');
        logDebug(`Saved settings: ${JSON.stringify(settings)}`);
    } catch (error) {
        logDebug(`Error saving settings: ${error}`);
    }
}

// Function to dispose of the TTS panel
function disposeTTSPanel(): void {
    if (ttsPanel) {
        ttsPanel.dispose();
        ttsPanel = undefined;
    }
}

// Called when the extension is deactivated
export function deactivate() {
    disposeTTSPanel();
} 