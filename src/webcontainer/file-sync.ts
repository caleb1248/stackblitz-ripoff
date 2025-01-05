import webContainer from './init';
import * as vscode from 'vscode';

// not done yet

if (globalThis.autoSyncFiles) {
  webContainer.fs.watch('/', { recursive: true }, async (type, name) => {
    if (type === 'rename') {
      try {
        const stat = await vscode.workspace.fs.stat(vscode.Uri.file(type));
        if ((stat.type & 0b11) == vscode.FileType.Directory) {
          console.log('rename directory', name);
        }
      } catch {}
    }
  });
}

async function getDir(path: string, create = false) {
  const relativePath = path.replace('\\', '/').replace(/^\/home\/projects/, '');
  const segments = relativePath.split('/');
  let handle = globalThis.currentHandle;
  for (const segment of segments) {
    handle = await handle.getDirectoryHandle(segment, { create });
  }

  return handle;
}

async function syncFileToDisk(path: string) {
  const relativePath = path.replace('\\', '/').replace(/^\/home\/projects/, '');
  const segments = relativePath.split('/');
  let handle = globalThis.currentHandle;
  for (const segment of segments) {
    handle = await handle.getDirectoryHandle(segment, { create: true });
  }
}
