import * as vscode from 'vscode';
import { getWebviewContent, getChatObserverScript } from './webview';
import { getConfiguration, logDebug, showInfo } from './utils';

// Store global state
let ttsEnabled = true;
let autoReadEnabled = true;
let ttsPanel: vscode.WebviewPanel | undefined;
let lastAIResponseText: string = '';
let observerInjected = false;
let activeDocumentChanges: Map<string, number> = new Map(); // Track document changes

// Extension activation - called when the extension is activated
export function activate(context: vscode.ExtensionContext) {
    logDebug('Cursor AI TTS extension is now active');

    // Load configuration
    const config = getConfiguration();
    ttsEnabled = config.get('enabled') as boolean;
    autoReadEnabled = config.get('autoRead') as boolean;

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

    // Add new command for toggling auto-read
    context.subscriptions.push(
        vscode.commands.registerCommand('cursor-ai-tts.toggleAutoRead', () => {
            autoReadEnabled = !autoReadEnabled;
            getConfiguration().update('autoRead', autoReadEnabled, true);
            showInfo(`Auto-read ${autoReadEnabled ? 'enabled' : 'disabled'}`);
        })
    );

    // Register a command to receive AI responses from chat interface
    context.subscriptions.push(
        vscode.commands.registerCommand('cursor-ai-tts.aiResponseDetected', (text: string) => {
            if (text && text.length > 10) {
                logDebug(`Received AI response from chat interface: ${text.substring(0, 50)}...`);
                lastAIResponseText = text;
                
                // If TTS is enabled, panel exists, and auto-read is on, speak it
                if (ttsEnabled && ttsPanel && autoReadEnabled) {
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

    // Enhanced listener for document changes - more aggressive detection
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
            if (!ttsEnabled || !ttsPanel) {
                return;
            }

            const document = event.document;
            const uri = document.uri.toString();
            const changes = event.contentChanges;
            
            // Skip if no changes
            if (changes.length === 0) {
                return;
            }

            try {
                // Process only significant changes
                for (const change of changes) {
                    const changedText = change.text;
                    
                    // Skip very short changes
                    if (changedText.length < 10) {
                        continue;
                    }

                    // Skip if the change is likely typing (one line at a time)
                    if (changedText.split('\n').length <= 1 && changedText.length < 50) {
                        continue;
                    }
                    
                    // Check if this is a new document or significant addition to an existing document
                    const previousLength = activeDocumentChanges.get(uri) || 0;
                    const currentLength = document.getText().length;
                    activeDocumentChanges.set(uri, currentLength);
                    
                    const isNewContent = previousLength === 0 || 
                        (currentLength - previousLength) > 100 || 
                        changedText.length > 100;
                    
                    if (!isNewContent) {
                        continue;
                    }
                    
                    // Check for patterns that indicate AI responses
                    const isLikelyAIResponse = 
                        // Is this a markdown document?
                        document.languageId === 'markdown' ||
                        // Or contains markdown code blocks?
                        changedText.includes('```') ||
                        // Or has reasonably complete sentences?
                        (changedText.includes('. ') && changedText.length > 80) ||
                        // Or has bullet points?
                        (changedText.includes('* ') && changedText.includes('\n')) ||
                        // Or has numbered lists?
                        (/\d+\.\s/.test(changedText) && changedText.includes('\n'));
                    
                    if (isLikelyAIResponse) {
                        logDebug(`Detected likely AI response in document: ${uri}`);
                        logDebug(`Change length: ${changedText.length}, content preview: ${changedText.substring(0, 100)}...`);
                        
                        // This looks like an AI-generated response based on patterns
                        lastAIResponseText = changedText;
                        
                        // Speak if auto-read is enabled
                        if (autoReadEnabled && ttsPanel) {
                            ttsPanel.webview.postMessage({
                                command: 'forceSpeech',
                                text: changedText
                            });
                        }
                        
                        break; // Process only one significant change per event
                    }
                }
            } catch (error) {
                logDebug(`Error processing text change: ${error}`);
            }
        })
    );

    // Also listen for new documents being created - often happens with AI responses
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument((document) => {
            if (!ttsEnabled || !ttsPanel || !autoReadEnabled) {
                return;
            }
            
            try {
                const uri = document.uri.toString();
                const text = document.getText();
                
                // Skip empty or very short documents
                if (text.length < 50) {
                    return;
                }
                
                // Track this document
                activeDocumentChanges.set(uri, text.length);
                
                // Only process new markdown documents or cursor chat files
                const isCursorAIDocument = 
                    document.languageId === 'markdown' || 
                    uri.includes('cursor') || 
                    uri.includes('chat') ||
                    uri.includes('assistant');
                
                if (isCursorAIDocument) {
                    logDebug(`New document opened that may contain AI response: ${uri}`);
                    logDebug(`Document length: ${text.length}, preview: ${text.substring(0, 100)}...`);
                    
                    // This looks like it might be an AI response document
                    lastAIResponseText = text;
                    
                    // Speak if auto-read is enabled
                    if (autoReadEnabled && ttsPanel) {
                        ttsPanel.webview.postMessage({
                            command: 'forceSpeech',
                            text: text
                        });
                    }
                }
            } catch (error) {
                logDebug(`Error processing new document: ${error}`);
            }
        })
    );

    // Try to detect specific Cursor AI command calls
    context.subscriptions.push(
        vscode.commands.registerCommand('cursor.cursorChatRequest', (args: any) => {
            logDebug(`Cursor chat request detected with args: ${JSON.stringify(args)}`);
        })
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('cursor.cursorChatResponse', (args: any) => {
            logDebug(`Cursor chat response detected with args: ${JSON.stringify(args)}`);
            if (args && args.text) {
                lastAIResponseText = args.text;
                
                if (ttsEnabled && autoReadEnabled && ttsPanel) {
                    ttsPanel.webview.postMessage({
                        command: 'forceSpeech',
                        text: args.text
                    });
                }
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
    
    // Monitor clipboard content for potential AI responses
    if (vscode.env.clipboard) {
        // Check clipboard every few seconds for AI content that might have been copied
        setInterval(async () => {
            try {
                if (ttsEnabled && autoReadEnabled && ttsPanel) {
                    const clipboardText = await vscode.env.clipboard.readText();
                    
                    // Skip if empty or too short
                    if (!clipboardText || clipboardText.length < 100) {
                        return;
                    }
                    
                    // Check if this looks like an AI response (similar patterns as above)
                    const isLikelyAIResponse = 
                        // Contains markdown code blocks?
                        clipboardText.includes('```') ||
                        // Has reasonably complete sentences?
                        (clipboardText.includes('. ') && clipboardText.split('. ').length > 3) ||
                        // Has bullet points?
                        (clipboardText.includes('* ') && clipboardText.includes('\n')) ||
                        // Has numbered lists?
                        (/\d+\.\s/.test(clipboardText) && clipboardText.includes('\n'));
                    
                    if (isLikelyAIResponse) {
                        logDebug(`Detected potential AI response in clipboard: ${clipboardText.substring(0, 100)}...`);
                        
                        // Only process if it's different from last known response
                        if (clipboardText !== lastAIResponseText) {
                            lastAIResponseText = clipboardText;
                            
                            // Optionally read it - might be disabled by default to avoid annoyance
                            const shouldReadClipboard = config.get('readClipboard') as boolean;
                            if (shouldReadClipboard && ttsPanel) {
                                ttsPanel.webview.postMessage({
                                    command: 'speak',
                                    text: clipboardText
                                });
                            }
                        }
                    }
                }
            } catch (error) {
                // Silent fail for clipboard operations
            }
        }, 5000); // Check every 5 seconds
    }
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
                    
                case 'debug':
                    // Handle debug messages from the chat observer script
                    logDebug(`Observer debug: ${message.message}`);
                    break;
                    
                case 'aiResponseDetected':
                    // Handle AI response detected from chat observer
                    if (message.text && message.text.length > 10) {
                        logDebug(`AI response detected from chat observer: ${message.text.substring(0, 50)}...`);
                        lastAIResponseText = message.text;
                        
                        // If auto-read is enabled, speak the text
                        if (autoReadEnabled && ttsPanel) {
                            ttsPanel.webview.postMessage({
                                command: 'forceSpeech',
                                text: message.text
                            });
                        }
                    }
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

// Function to dispose of the TTS panel
function disposeTTSPanel(): void {
    if (ttsPanel) {
        ttsPanel.dispose();
        ttsPanel = undefined;
    }
}

// Function to save user settings
function saveSettings(settings: any): void {
    const config = getConfiguration();
    config.update('voice', settings.voice, true);
    config.update('rate', settings.rate, true);
    config.update('pitch', settings.pitch, true);
    config.update('filterCodeBlocks', settings.filterCodeBlocks, true);
    showInfo('Settings saved');
}

// This method is called when your extension is deactivated
export function deactivate() {
    disposeTTSPanel();
} 