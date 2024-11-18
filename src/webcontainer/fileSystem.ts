import type { WebContainerProcess } from '@webcontainer/api';
import webContainer from './init';
import { IFileSystemProviderWithFileReadWriteCapability, IStat } from 'vscode/vscode/vs/platform/files/common/files';
import { URI } from 'vscode/vscode/vs/base/common/uri';
import { Emitter } from 'vscode/vscode/vs/base/common/event';

// Webcontainer doesn't have a built-in stat function, so we need to create a process and communicate with it to get the stat information.
// We will use stdio to communicate with the process.

async function createNodeStatProgram() {
  const contents = `
const fs = require('fs');
const path = require('path');
process.stdin.on('data', (data) => {
  let { path: filePath, id } = JSON.parse(data);
  filePath = path.join('/home/projects', filePath);

  fs.stat(filePath, (err, stats) => {
    let type = 'unknown';
    if (stats) {
      if (stats.isFile()) {
        type = 'file';
      } else if (stats.isDirectory()) {
        type = 'directory';
      }
    }
    if (err) {
      process.stdout.write(JSON.stringify({ id, error: err.message }));
    } else {
      process.stdout.write(JSON.stringify({ id, type }));
    }
  });
});
  `;

  // WebContainer doesn't support writing files outside of home/projects, so we need create a file to create the stat file outisde of home/projects. Then we can delete the file.
  await webContainer.fs.writeFile(
    '/statprogramcreate.js',
    `const fs = require('fs');

fs.writeFileSync('/home/statrpc.js', ${JSON.stringify(contents)});`
  );

  const statProgramCreator = await webContainer.spawn('node', ['statprogramcreate.js']);
  await statProgramCreator.exit;

  await webContainer.fs.rm('/statprogramcreate.js', { force: true });
}

class StatRpc {
  // @ts-expect-error - This will definitely be initialized in the create method.
  private _process: WebContainerProcess;
  // @ts-expect-error - This will definitely be initialized in the create method.
  private _input: WritableStreamDefaultWriter = [];
  // @ts-expect-error - This will definitely be initialized in the create method.
  private _output: ReadableStreamDefaultReader = [];

  private _dataEmitter = new Emitter<string>();
  private _onData = this._dataEmitter.event;

  private constructor() {}

  private async _startProcess() {
    await createNodeStatProgram();

    this._process = await webContainer.spawn('node', ['/home/statrpc.js']);
    this._input = this._process.input.getWriter();
    this._output = this._process.output.getReader();
  }

  private _idCounter = 0;

  public async stat(uri: URI): Promise<IStat> {
    const id = Math.random().toString();
    const path = uri.path;
    const data = JSON.stringify({ path, id });
    this._input.write(data);

    const result = await new Promise<string>((resolve) => {
      const disposable = this._onData((data: string) => {
        const { id: resultId, type, error } = JSON.parse(data);
        if (resultId === id) {
          disposable.dispose();
          resolve({ type, error });
        }
      });
    });

    if (result.error) {
      throw new Error(result.error);
    }

    return {
      type: result.type === 'file' ? 1 : 2,
      ctime: 0,
      mtime: 0,
      size: 0,
    };
  }

  static async create() {
    const statRpc = new StatRpc();
    await statRpc._startProcess();
    return statRpc;
  }
}

class WebContainerFileSystemProvider implements IFileSystemProviderWithFileReadWriteCapability {
  // @ts-expect-error
  private _statRpc: StatRpc;

  private constructor() {}

  public static async create() {
    const fileSystem = new WebContainerFileSystemProvider();
    fileSystem._statRpc = await StatRpc.create();
    return fileSystem;
  }
}

createNodeStatProgram();
