import type { WebContainerProcess } from '@webcontainer/api';
import webContainer, { toRelativePath } from './init';
import {
  FileChangeType,
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
} from 'vscode/vscode/vs/platform/files/common/files';
import { URI } from 'vscode/vscode/vs/base/common/uri';
import { Emitter, Event } from 'vscode/vscode/vs/base/common/event';
import statrpcBackend from './statrpc-backend?raw';
import { BaseTransports, Connection, createConnection, Message, ValidJsonObject } from 'portablerpc';

// Look at https://github.com/microsoft/vscode/blob/main/src/vs/platform/files/node/diskFileSystemProvider.ts
// Also look at https://github.com/microsoft/vscode/blob/main/src/vs/base/node/pfs.ts

// Webcontainer doesn't have a built-in stat function, so we need to create a process and communicate with it to get the stat information.
// We will use stdio to communicate with the process.

async function createNodeStatProgram() {
  // WebContainer doesn't support writing files outside of the working directory, so we need create a file to create the stat file outisde of the working directory. Then we can delete the file.
  await webContainer.fs.writeFile(
    '/statprogramcreate.cjs',
    `const fs = require('fs');
fs.mkdirSync('/home/.editor-internal');
fs.writeFileSync('/home/.editor-internal/statrpc.js', ${JSON.stringify(statrpcBackend)});`
  );

  const statProgramCreator = await webContainer.spawn('node', ['statprogramcreate.cjs']);
  statProgramCreator.output.pipeTo(new WritableStream({ write: console.log }));
  const code = await statProgramCreator.exit;
  if (code !== 0) {
    throw new Error('Failed to create stat program');
  }

  await webContainer.fs.rm('/statprogramcreate.cjs', { force: true });
}

interface StatResult extends ValidJsonObject {
  ctime: number;
  mtime: number;
  size: number;
  permissions: 'locked';
  type: 'file' | 'directory' | 'unknown';
  isSymlink: boolean;
}

interface StatError extends ValidJsonObject {
  error: string;
}

interface Dirent extends ValidJsonObject {
  name: string;
  type: 'directory' | 'file' | 'unknown';
  isSymlink: boolean;
}

interface ReaddirResult extends ValidJsonObject, Record<string, unknown> {
  result: Dirent[];
}
interface ReaddirError extends StatError {}

interface ExistsResult extends ValidJsonObject {
  exists: boolean;
}

class StatRpcError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

class WebContainerTransports extends BaseTransports {
  private _writer: WritableStreamDefaultWriter<string>;

  constructor(writer: WritableStreamDefaultWriter<string>) {
    super();
    this._writer = writer;
  }
  sendMessage<T extends Message>(message: T): void {
    this._writer.write(JSON.stringify(message) + '\n');
  }

  public fireMessage = super.fireMessage;
}

class StatRpc {
  // @ts-expect-error - This will definitely be initialized in the create method.
  private _process: WebContainerProcess;
  // @ts-expect-error - This will definitely be initialized in the create method.
  private _input: WritableStreamDefaultWriter = [];
  // @ts-expect-error - This will definitely be initialized in the create method.
  private _output: ReadableStream;
  // @ts-expect-error - This will definitely be initialized in the create method.
  private _transports: WebContainerTransports;
  // @ts-expect-error - This will definitely be initialized in the create method.
  public connection: Connection;

  private constructor() {}

  private async _startProcess() {
    await createNodeStatProgram();

    this._process = await webContainer.spawn('node', ['/home/.editor-internal/statrpc.js']);
    this._input = this._process.input.getWriter();
    this._output = this._process.output;
    await new Promise<void>((resolve) => {
      this._output.pipeTo(
        new WritableStream<string>({
          write: (data) => {
            if (data.startsWith('ready')) {
              console.log('YAY!');
              this._transports = new WebContainerTransports(this._input);
              this.connection = createConnection(this._transports);
              resolve();
              return;
            }

            // console.log(data);

            if (this._transports) {
              const parsed = JSON.parse(data);
              if ('params' in parsed) return;
              this._transports.fireMessage(parsed);
            } else {
              console.log('sus message received', data);
            }
          },
        })
      );
    });

    console.log('process ready!');
  }

  public async stat(uri: URI): Promise<IStat> {
    const path = uri.path;

    const result = await this.connection.sendRequest<StatResult | StatError>('stat', { path });
    if (result.error) throw new StatRpcError(result.error as string);

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
      mtime: result.mtime as number,
      ctime: result.ctime as number,
      size: result.size as number,
      permissions: result.permissions === 'locked' ? FilePermission.Locked : undefined,
    };
  }

  public async exists(path: URI) {
    const result = this.connection.sendRequest<ExistsResult>('exists', { path: path.path });
    return await result;
  }

  public async readdir(path: URI) {
    const result = await this.connection.sendRequest<ReaddirResult | ReaddirError>('readdir', { path: path.path });
    if ('error' in result) {
      throw new StatRpcError(result.error as string);
    }
    return result.result;
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

  private constructor() {
    this.onDidChangeFile((e) => {
      if (e[0].type == FileChangeType.ADDED) {
        if (e[0].resource.path.includes('node_modules')) return;
        console.log('file added', e[0].resource.path);
      }
    });
  }

  public static async create() {
    const fileSystem = new WebContainerFileSystemProvider();
    fileSystem._statRpc = await StatRpc.create();

    // Uncomment this when webcontainer upgrades to node 20
    // fileSystem._statRpc.connection.onNotification('fileChanged', ({ type, path }) => {
    //   const convertedType =
    //     type === 'create' ? FileChangeType.ADDED : type === 'delete' ? FileChangeType.DELETED : FileChangeType.UPDATED;
    //   fileSystem._fileChangedEmitter.fire([{ type: convertedType, resource: URI.file(path) }]);
    // });

    webContainer.fs.watch('/', { recursive: true, encoding: 'utf-8' }, async (type, filename) => {
      if (type == 'change') {
        fileSystem._fileChangedEmitter.fire([{ type: FileChangeType.UPDATED, resource: URI.file(filename as string) }]);
        return;
      }
      const exists = await fileSystem.exists(URI.file(filename as string));
      fileSystem._fileChangedEmitter.fire([
        { type: exists ? FileChangeType.ADDED : FileChangeType.DELETED, resource: URI.file(filename as string) },
      ]);
    });

    return fileSystem;
  }

  public watch(_uri: URI) {
    // console.log('watching path', uri.toString());
    return { dispose() {} };
  }

  public async stat(resource: URI): Promise<IStat> {
    try {
      const result = await this._statRpc.stat(resource);
      return result;
    } catch (e) {
      let code =
        e instanceof StatRpcError && e.code === 'ENOENT'
          ? FileSystemProviderErrorCode.FileNotFound
          : FileSystemProviderErrorCode.Unknown;
      throw FileSystemProviderError.create(
        ((<{ code: string }>e).code || e?.toString() || 'Error') + ` while trying to stat ${resource.toString()}`,
        code
      );
    }
  }

  async readFile(resource: URI): Promise<Uint8Array> {
    const stat = await this.stat(resource);
    if (stat.type === FileType.Directory) {
      throw FileSystemProviderError.create('File is a directory', FileSystemProviderErrorCode.FileIsADirectory);
    }

    try {
      return await webContainer.fs.readFile(toRelativePath(resource.path));
    } catch (e) {
      throw FileSystemProviderError.create('File not found', FileSystemProviderErrorCode.FileNotFound);
    }
  }

  exists(resource: URI) {
    return this._statRpc.exists(resource);
  }

  async rename(from: URI, to: URI, opts: IFileOverwriteOptions): Promise<void> {
    if (opts.overwrite && (await this.exists(to))) {
      throw FileSystemProviderError.create('Destination already exists', FileSystemProviderErrorCode.FileExists);
    } else {
      await webContainer.fs.rename(toRelativePath(from.path), toRelativePath(to.path));
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

    console.log(toRelativePath(resource.path));
    await webContainer.fs.writeFile(toRelativePath(resource.path), content);
  }

  async mkdir(resource: URI): Promise<void> {
    await webContainer.fs.mkdir(toRelativePath(resource.path));
  }

  async delete(resource: URI, opts: IFileDeleteOptions): Promise<void> {
    await webContainer.fs.rm(toRelativePath(resource.path), {
      recursive: opts.recursive,
    });
  }

  async readdir(resource: URI): Promise<[string, FileType][]> {
    const result = await this._statRpc.readdir(resource);
    return result.map((dirent) => {
      let type: FileType;
      switch (dirent.type) {
        case 'file':
          type = FileType.File;
          break;
        case 'directory':
          type = FileType.Directory;
          break;
        default:
          type = FileType.Unknown;
      }

      if (dirent.isSymlink) type |= FileType.SymbolicLink;
      return [dirent.name, type];
    });
  }
}

export default WebContainerFileSystemProvider;
