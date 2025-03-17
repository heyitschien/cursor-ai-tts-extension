import * as vscode from 'vscode';

// Helper function to get configuration
export function getConfiguration() {
  return vscode.workspace.getConfiguration('cursor-ai-tts');
}

// Helper to log debug information
export function logDebug(message: string, obj?: any) {
  console.log(`[Cursor AI TTS] ${message}`, obj || '');
}

// Helper to show information message
export function showInfo(message: string) {
  vscode.window.showInformationMessage(message);
}

// Helper to show error message
export function showError(message: string) {
  vscode.window.showErrorMessage(message);
}

// Get extension path
export function getExtensionPath(context: vscode.ExtensionContext) {
  return context.extensionPath;
}

// Get media path
export function getMediaPath(context: vscode.ExtensionContext, filename: string) {
  return vscode.Uri.joinPath(context.extensionUri, 'media', filename);
}

// Utility function to get resource path for the WebView
export function getWebviewResourceUri(webview: vscode.Webview, context: vscode.ExtensionContext, filePath: string): vscode.Uri {
  return webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, filePath));
}

// Function to add nonce for content security policy
export function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
} 