import { FileSystemTree } from '@webcontainer/api';
import webContainer, { toRelativePath, workdirPath } from './init';
import { ExtensionHostKind, registerExtension } from 'vscode/extensions';

let pullingInProgress = false;

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
          command: 'localFileSynchronizer.push',
          title: 'Push files to local file system',
          category: 'File Sync',
        },
        {
          command: 'localFileSynchronizer.pull',
          title: 'Pull files from local file system',
          category: 'File Sync',
        },
      ],
    },
  },
  ExtensionHostKind.LocalProcess
).getApi();

if (globalThis.autoSyncFiles) {
  webContainer.fs.watch('/', { recursive: true }, async (type, name) => {
    if (pullingInProgress) return;
    name = name as string;
    const fsName = `${workdirPath}/${name}`;
    if (name.includes('node_modules')) return;
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
        // console.log(data);
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
  const relativePath = toRelativePath(path);
  const segments = relativePath.split('/');
  let handle = globalThis.currentHandle;
  for (const segment of segments) {
    if (!segment) continue;
    handle = await handle.getDirectoryHandle(segment, { create });
  }

  return handle;
}

function syncToDiskRecursive(tree: FileSystemTree, handle: FileSystemDirectoryHandle) {
  const promises: Promise<void>[] = [];
  for (const item in tree) {
    if (item.includes('node_modules')) continue;
    const entry = tree[item];
    if ('file' in entry) {
      if ('symlink' in entry.file) {
        // Symlinks are not supported in the file system access api
        console.warn('Symlinks are not supported in the file system access api');
        continue;
      }

      const contents = entry.file.contents;

      promises.push(
        handle
          .getFileHandle(item, { create: true })
          .then((fileHandle) => fileHandle.createWritable())
          .then((writable) => writable.write(contents).then(() => writable.close()))
      );
    } else {
      // Directory
      promises.push(
        handle.getDirectoryHandle(item, { create: true }).then((dirHandle) => {
          syncToDiskRecursive(entry.directory, dirHandle);
        })
      );
    }
  }

  return Promise.all(promises);
}

api.commands.registerCommand('localFileSynchronizer.sync', async () => {
  const handle = globalThis.currentHandle;
  if (!handle) {
    return;
  }

  const tree = await webContainer.export('');
  console.log(tree);
  await syncToDiskRecursive(tree, handle);
});

api.commands.registerCommand('localFileSynchronizer.pull', async () => {
  const handle = globalThis.currentHandle;
  if (!handle) {
    return;
  }

  pullingInProgress = true;
  await pullRecursive(handle);
  pullingInProgress = false;
});

async function pullRecursive(directoryHandle: FileSystemDirectoryHandle, basePath = '/') {
  const promises: Promise<void>[] = [];

  const existingEntryNames = new Set(await webContainer.fs.readdir(basePath));

  for await (const entry of directoryHandle.values()) {
    const path = `${basePath}${entry.name}`;
    await webContainer.fs.rm(path, { force: true, recursive: true });
    if (entry.kind === 'file') {
      promises.push(
        entry
          .getFile()
          .then((file) => file.arrayBuffer())
          .then((buffer) => webContainer.fs.writeFile(path, new Uint8Array(buffer)))
          .catch((e) => console.error(e))
      );
    } else if (entry.kind === 'directory') {
      promises.push(webContainer.fs.mkdir(path).then(() => pullRecursive(entry, `${path}/`)));
    }

    existingEntryNames.delete(entry.name);
  }

  for (const name of existingEntryNames) {
    promises.push(webContainer.fs.rm(`${basePath}${name}`, { recursive: true, force: true }));
  }

  await Promise.all(promises);
}
