import * as vscode from 'vscode';
import webContainer, { portMap } from './init';

interface WebContainerLink extends vscode.TerminalLink {
  port: number;
}

vscode.window.registerTerminalLinkProvider(<vscode.TerminalLinkProvider<WebContainerLink>>{
  provideTerminalLinks(context, _token) {
    const regex = /(?:(?:(?:https?):)?(?:\/\/)?)?localhost(?::([0-9]+))?(?:\/\S*)?/gi;
    const matchArray = Array.from(context.line.matchAll(regex));
    return matchArray.map((match) => {
      const url = match[0];
      const port = parseInt(match[1] || '80');

      const startIndex = match.index;
      console.log('link', url, port);
      return {
        startIndex,
        length: url.length,
        port,
      };
    });
  },

  handleTerminalLink(link) {
    openPreview(link.port);
  },
});

webContainer.on('server-ready', (port) => {
  vscode.window.showInformationMessage(`A server is ready on port ${port}`, 'Open Preview').then((value) => {
    if (value === 'Open Preview') {
      openPreview(port);
    }
  });
});

function openPreview(port: number) {
  const url = portMap.get(port);
  console.log(url);
  if (url) {
    vscode.commands.executeCommand('simpleBrowser.api.open', url, { viewColumn: vscode.ViewColumn.Beside });
    // vscode.commands.executeCommand('simpleBrowser.show', url);
  }
}

console.log('preview.ts loaded');
