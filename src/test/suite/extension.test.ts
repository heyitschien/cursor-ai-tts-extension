import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Starting all tests.');

    test('Extension should be present', () => {
        assert.ok(vscode.extensions.getExtension('cursor-ai-tts.cursor-ai-tts'));
    });

    test('Should register commands', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(commands.includes('cursor-ai-tts.enable'));
        assert.ok(commands.includes('cursor-ai-tts.disable'));
        assert.ok(commands.includes('cursor-ai-tts.showSettings'));
    });
}); 