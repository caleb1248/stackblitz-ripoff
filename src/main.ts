import './setup';
import * as vscode from 'vscode';

import '@codingame/monaco-vscode-simple-browser-default-extension';

import '@codingame/monaco-vscode-theme-defaults-default-extension';
import './material-icon-theme.vsix';

import '@codingame/monaco-vscode-shellscript-default-extension';

import '@codingame/monaco-vscode-javascript-default-extension';
import '@codingame/monaco-vscode-typescript-basics-default-extension';
import '@codingame/monaco-vscode-typescript-language-features-default-extension';

import '@codingame/monaco-vscode-json-default-extension';
import '@codingame/monaco-vscode-json-language-features-default-extension';

import '@codingame/monaco-vscode-html-default-extension';
// import '@codingame/monaco-vscode-html-language-features-default-extension';

import '@codingame/monaco-vscode-css-default-extension';
// import '@codingame/monaco-vscode-css-language-features-default-extension';
console.log('test');
await import('./webcontainer/preview');
await import('./webcontainer/file-sync');
await vscode.commands.executeCommand('workbench.view.explorer');
document.getElementById('loading-screen')?.remove();
