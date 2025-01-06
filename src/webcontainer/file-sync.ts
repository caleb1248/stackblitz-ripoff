import webContainer from './init';
import { ExtensionHostKind, registerExtension } from 'vscode/extensions';

const api = await registerExtension(
  {
    name: 'Local File Synchronizer',
    publisher: 'caleb1248',
    version: '0.0.1',
    engines: {
      vscode: '*',
    },

    contributes: {
      commands: [
        {
          command: 'localFileSynchronizer.sync',
          title: 'Sync workspace to local file system',
          category: 'Local File Synchronizer',
        },
      ],
    },
  },
  ExtensionHostKind.LocalProcess
).getApi();

if (globalThis.autoSyncFiles) {
  webContainer.fs.watch('/', { recursive: true }, async (type, name) => {
    name = name as string;
    const fsName = '/home/projects/' + name;
    if (type === 'rename') {
      console.log('rename', fsName);
      try {
        const stat = await api.workspace.fs.stat(api.Uri.file(fsName as string));
        if (stat.type & api.FileType.Directory) {
          await getDir(name, true);
        } else if (stat.type & api.FileType.File) {
          const parent = name.split('/').slice(0, -1).join('/');
          try {
            const parentHandle = await getDir(parent, true);
            await parentHandle.getFileHandle(name.split('/').pop() as string, { create: true });
          } catch (e) {
            console.warn('Failed to create file', name + ':', e);
          }
        }
      } catch (e) {
        // file does not exist, we need to remove it on the local file system
        // get the parent of the file name
        const parent = name.split('/').slice(0, -1).join('/');
        try {
          const parentHandle = await getDir(parent);
          await parentHandle.removeEntry(name.split('/').pop() as string);
        } catch (e) {
          console.warn('Failed to remove file', name + ':', e);
        }
      }
    } else {
      console.log('change', fsName);
      try {
        const data = await webContainer.fs.readFile(name, 'utf-8');
        console.log(data);
        const parent = name.split('/').slice(0, -1).join('/');
        try {
          const parentHandle = await getDir(parent);
          const fileHandle = await parentHandle.getFileHandle(name.split('/').pop() as string, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(data);
          await writable.close();
        } catch (e) {
          console.warn('Failed to write file to path', name + ':', e);
        }
      } catch (e) {
        console.warn('Failed to read file', name + ':', e);
        // Probably got deleted right after it got changed. Do nothing.
      }
    }
  });
}

async function getDir(path: string, create = false) {
  const relativePath = path.replace('\\', '/').replace(/^\/home\/projects/, '');
  const segments = relativePath.split('/');
  let handle = globalThis.currentHandle;
  for (const segment of segments) {
    if (!segment) continue;
    handle = await handle.getDirectoryHandle(segment, { create });
  }

  return handle;
}

api.commands.registerCommand('localFileSynchronizer.sync', async () => {
  const handle = globalThis.currentHandle;
  if (!handle) {
    return;
  }

  const tree = await webContainer.export('');
  console.log(tree);
});
