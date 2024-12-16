// Language feature extensions are not currently working, I will implement them for webcontainer in the future.

import './style.css';
import './setup';

import '@codingame/monaco-vscode-theme-defaults-default-extension';
import './material-icon-theme.vsix';

import '@codingame/monaco-vscode-javascript-default-extension';
import '@codingame/monaco-vscode-typescript-basics-default-extension';

import '@codingame/monaco-vscode-json-default-extension';
// import '@codingame/monaco-vscode-json-language-features-default-extension';

import '@codingame/monaco-vscode-html-default-extension';
// import '@codingame/monaco-vscode-html-language-features-default-extension';

import '@codingame/monaco-vscode-css-default-extension';
// import '@codingame/monaco-vscode-css-language-features-default-extension';

document.getElementById('loading-screen')?.remove();
