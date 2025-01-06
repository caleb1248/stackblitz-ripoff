import { WebContainer, FileSystemTree } from '@webcontainer/api';

const loadingScreen = document.getElementById('loading-screen')!;

loadingScreen.innerHTML = 'Booting Webcontainer...';

const webContainer = await WebContainer.boot({
  workdirName: 'projects',
});

async function readRecursive(dirHandle: FileSystemDirectoryHandle, baseHandle = dirHandle): Promise<FileSystemTree> {
  const tree: FileSystemTree = {};
  const promises = (await Array.fromAsync(dirHandle.entries())).map(async ([name, handle]) => {
    if (handle.kind == 'directory') {
      if (name !== 'node_modules') {
        tree[name] = { directory: await readRecursive(handle, baseHandle) };
      }
    } else {
      return handle

        .getFile()
        .then((f) => f.arrayBuffer())
        .then((buff) => {
          tree[name] = {
            file: {
              contents: new Uint8Array(buff),
            },
          };
        })
        .catch(async (e) => {
          console.error(e);
          console.error("couldn't read file", (await baseHandle.resolve(handle))?.join('/'));
        });
    }
  });

  await Promise.all(promises);

  return tree;
}

loadingScreen.innerHTML = 'Initializing files...';

export async function mountHandle(handle: FileSystemDirectoryHandle) {
  return await webContainer.mount(await readRecursive(handle));
}

await mountHandle(globalThis.currentHandle);

const portMap = new Map<number, string>();
webContainer.on('port', (port, type, url) => {
  if (type === 'open') {
    portMap.set(port, url);
  } else {
    portMap.delete(port);
  }
});

export default webContainer;
export { portMap };
