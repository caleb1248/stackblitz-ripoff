import type { WebContainerProcess } from '@webcontainer/api';
import webContainer from './init';
import {
  FilePermission,
  FileSystemProviderCapabilities,
  FileSystemProviderError,
  FileSystemProviderErrorCode,
  FileType,
  IFileChange,
  IFileDeleteOptions,
  IFileOverwriteOptions,
  IFileSystemProviderWithFileReadWriteCapability,
  IFileWriteOptions,
  IStat,
  IWatchOptions,
} from 'vscode/vscode/vs/platform/files/common/files';
import { URI } from 'vscode/vscode/vs/base/common/uri';
import { Emitter, Event } from 'vscode/vscode/vs/base/common/event';
import statrpcBackend from './statrpc-backend?raw';
import { Disposable, IDisposable } from 'vscode/vscode/vs/base/common/lifecycle';
import { fstat } from 'fs';

// Look at https://github.com/microsoft/vscode/blob/main/src/vs/platform/files/node/diskFileSystemProvider.ts
// Also look at https://github.com/microsoft/vscode/blob/main/src/vs/base/node/pfs.ts

// Webcontainer doesn't have a built-in stat function, so we need to create a process and communicate with it to get the stat information.
// We will use stdio to communicate with the process.

async function createNodeStatProgram() {
  // WebContainer doesn't support writing files outside of home/projects, so we need create a file to create the stat file outisde of home/projects. Then we can delete the file.
  await webContainer.fs.writeFile(
    '/statprogramcreate.js',
    `const fs = require('fs');
fs.mkdirSync('/home/editor-internal');
fs.writeFileSync('/home/editor-internal/statrpc.js', ${JSON.stringify(statrpcBackend)});`
  );

  const statProgramCreator = await webContainer.spawn('node', ['statprogramcreate.js']);
  await statProgramCreator.exit;

  await webContainer.fs.rm('/statprogramcreate.js', { force: true });
}

interface RpcMessage {
  id: number;
}

interface StatResult extends RpcMessage {
  ctime: number;
  mtime: number;
  size: number;
  permissions: 'locked' | undefined;
  type: 'file' | 'directory' | 'unknown';
  isSymlink: boolean;
}

interface StatError extends RpcMessage {
  error: string;
}

interface ExistsResult extends RpcMessage {
  exists: boolean;
}

class StatRpcError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

class StatRpc {
  // @ts-expect-error - This will definitely be initialized in the create method.
  private _process: WebContainerProcess;
  // @ts-expect-error - This will definitely be initialized in the create method.
  private _input: WritableStreamDefaultWriter = [];
  // @ts-expect-error - This will definitely be initialized in the create method.
  private _output: ReadableStream = [];

  private _dataEmitter = new Emitter<any>();
  private _onData: <T extends RpcMessage>(listener: (e: T) => void) => IDisposable = this._dataEmitter.event;

  private constructor() {}

  private async _startProcess() {
    await createNodeStatProgram();

    this._process = await webContainer.spawn('node', ['/home/editor-internal/statrpc.js'], {
      terminal: { rows: 100, cols: 100 },
    });
    this._input = this._process.input.getWriter();
    this._output = this._process.output;
    await new Promise<void>((resolve) => {
      this._output.pipeTo(
        new WritableStream<string>({
          write: (data) => {
            if (data.startsWith('ready')) {
              resolve();
              return;
            }

            this._dataEmitter.fire(JSON.parse(data));
          },
        })
      );
    });

    console.log('process ready!');
  }

  private _idCounter = 0;

  public async stat(uri: URI): Promise<IStat> {
    const id = ++this._idCounter;
    const path = uri.path;
    const data = JSON.stringify({ path, id, type: 'stat' });
    this._input.write(data + '\r\n'); // A newline is required to trigger the stdin in webcontainers

    const result = await new Promise<StatError | StatResult>((resolve) => {
      const disposable = this._onData<StatResult | StatError>((statData) => {
        if (statData.id !== id || JSON.stringify(statData) === data) {
          console.log('no');
          return;
        }

        console.log('help', statData);
        disposable.dispose();
        resolve(statData);
      });
    });

    if ('error' in result) {
      throw new StatRpcError(result.error);
    }

    let type: FileType;
    switch (result.type) {
      case 'file':
        type = FileType.File;
        break;
      case 'directory':
        type = FileType.Directory;
        break;
      default:
        type = FileType.Unknown;
    }

    if (result.isSymlink) type |= FileType.SymbolicLink;

    return {
      type,
      mtime: result.mtime,
      ctime: result.ctime,
      size: result.size,
      permissions: result.permissions === 'locked' ? FilePermission.Locked : undefined,
    };
  }

  public async exists(path: URI) {
    const id = ++this._idCounter;

    const data = JSON.stringify({
      id,
      type: 'exists',
      path: path.path,
    });

    const result = new Promise<boolean>((resolve) => {
      const disposable = this._onData<ExistsResult>((existData) => {
        if (existData.id !== id || 'path' in existData) {
          console.log('no');
          return;
        }

        console.log('yes', existData);
        disposable.dispose();
        resolve(existData.exists);
      });
    });

    await this._input.write(data + '\n');
    return await result;
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

  onDidChangeCapabilities = Event.None;

  capabilities = FileSystemProviderCapabilities.FileReadWrite;

  private _fileChangedEmitter = new Emitter<IFileChange[]>();
  onDidChangeFile = this._fileChangedEmitter.event;

  private constructor() {}

  public static async create() {
    const fileSystem = new WebContainerFileSystemProvider();
    fileSystem._statRpc = await StatRpc.create();
    return fileSystem;
  }

  public watch() {
    // Unsupported - watches all files.
    return Disposable.None;
  }

  public async stat(resource: URI): Promise<IStat> {
    try {
      return this._statRpc.stat(resource);
    } catch (e) {
      let code =
        e instanceof StatRpcError && e.code === 'ENOENT'
          ? FileSystemProviderErrorCode.FileNotFound
          : FileSystemProviderErrorCode.Unknown;
      throw FileSystemProviderError.create(new Error('Error'), code);
    }
  }

  async readFile(resource: URI): Promise<Uint8Array> {
    const stat = await this.stat(resource);
    if (stat.type === FileType.Directory) {
      throw FileSystemProviderError.create('File is a directory', FileSystemProviderErrorCode.FileIsADirectory);
    }

    return await webContainer.fs.readFile(resource.path);
  }

  exists(resource: URI) {
    return this._statRpc.exists(resource);
  }

  async rename(from: URI, to: URI, opts: IFileOverwriteOptions): Promise<void> {
    if (opts.overwrite && (await this.exists(to))) {
      throw FileSystemProviderError.create('Destination already exists', FileSystemProviderErrorCode.FileExists);
    } else {
      await webContainer.fs.rename(from.path, to.path);
    }
  }

  async writeFile(resource: URI, content: Uint8Array, opts: IFileWriteOptions): Promise<void> {
    const doesExist = await this.exists(resource);

    if (doesExist && !opts.overwrite) {
      throw FileSystemProviderError.create('File already exists', FileSystemProviderErrorCode.FileExists);
    }

    if (!doesExist && !opts.create) {
      throw FileSystemProviderError.create('File not found', FileSystemProviderErrorCode.FileNotFound);
    }

    await webContainer.fs.writeFile(resource.path, content);
  }

  async mkdir(resource: URI): Promise<void> {
    await webContainer.fs.mkdir(resource.path);
  }

  async delete(resource: URI, opts: IFileDeleteOptions): Promise<void> {
    await webContainer.fs.rm(resource.path, {
      recursive: opts.recursive,
    });
  }
}

export default WebContainerFileSystemProvider;
