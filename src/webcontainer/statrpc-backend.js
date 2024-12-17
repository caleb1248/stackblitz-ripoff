// @ts-check

const fs = require('fs');
const path = require('path');

/**
 * @type {import('portablerpc')}
 */
var portableRpc = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all) __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if ((from && typeof from === 'object') || typeof from === 'function') {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, {
            get: () => from[key],
            enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable,
          });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, '__esModule', { value: true }), mod);
  var __async = (__this, __arguments, generator) => {
    return new Promise((resolve, reject) => {
      var fulfilled = (value) => {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      };
      var rejected = (value) => {
        try {
          step(generator.throw(value));
        } catch (e) {
          reject(e);
        }
      };
      var step = (x) => (x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected));
      step((generator = generator.apply(__this, __arguments)).next());
    });
  };

  // src/index.ts
  var src_exports = {};
  __export(src_exports, {
    BaseTransports: () => BaseTransports,
    createConnection: () => createConnection,
  });
  function createRequestQueue(transports) {
    const queue = /* @__PURE__ */ new Map();
    let currentId = 0;
    let disposed = false;
    const listener = transports.onMessage((message) => {
      if (disposed || message.portablerpc !== 'v1' || !('id' in message)) return;
      if ('error' in message) {
        const { id, error } = message;
        const [, reject] = queue.get(id);
        reject(error);
        queue.delete(id);
        return;
      }
      if ('result' in message) {
        const { id, result } = message;
        const [resolve] = queue.get(id);
        resolve(result);
        queue.delete(id);
        return;
      }
    });
    return {
      sendRequest(method, params) {
        if (disposed) {
          throw new Error('Connection is disposed');
        }
        return new Promise((resolve, reject) => {
          const id = ++currentId;
          queue.set(id, [resolve, reject]);
          transports.sendMessage({
            portablerpc: 'v1',
            id,
            method,
            params,
          });
        });
      },
      dispose() {
        disposed = true;
        listener.dispose();
        queue.clear();
      },
    };
  }
  function createConnection(transports) {
    const requestQueue = createRequestQueue(transports);
    const handlers = /* @__PURE__ */ new Map();
    const disposables = [];
    disposables.push(
      transports.onMessage((message) => {
        if (message.portablerpc !== 'v1' || !('method' in message)) return;
        const list = handlers.get(message.method);
        if (!list) return;
        if (!message.id) {
          for (let i = 0; i < list.length; i++) {
            list[i](message.params);
          }
        } else {
          (() =>
            __async(this, null, function* () {
              try {
                const result = yield list[0](message.params);
                transports.sendMessage({
                  portablerpc: 'v1',
                  id: message.id,
                  result,
                });
              } catch (error) {
                transports.sendMessage({
                  portablerpc: 'v1',
                  id: message.id,
                  error,
                });
              }
            }))();
        }
      })
    );
    return {
      sendRequest(method, params) {
        return requestQueue.sendRequest(method, params);
      },
      onRequest(method, handler) {
        if (!handlers.has(method)) {
          handlers.set(method, []);
        }
        const list = handlers.get(method);
        list.push(handler);
        return {
          dispose() {
            const index = list.indexOf(handler);
            if (index !== -1) {
              list.splice(index, 1);
            }
          },
        };
      },
      sendNotification(method, params) {
        transports.sendMessage({
          portablerpc: 'v1',
          method,
          params,
        });
      },
      onNotification(method, handler) {
        return transports.onMessage((message) => {
          if (message.portablerpc !== 'v1' || message.method !== method) return;
          handler(message.params);
        });
      },
      dispose() {
        requestQueue.dispose();
        disposables.forEach((d) => d.dispose());
      },
    };
  }
  var BaseTransports = class {
    constructor() {
      this._handlers = [];
    }
    /**
     * Fires a message to all registered handlers. Messages are validated, but non-messages will result in console warns, so *please* validate the messages yourself.
     */
    fireMessage(message) {
      if (typeof message !== 'object' || message === null || message.portablerpc !== 'v1') return;
      for (let i = 0; i < this._handlers.length; i++) {
        this._handlers[i](message);
      }
    }
    onMessage(handler) {
      this._handlers.push(handler);
      return {
        dispose() {
          const index = this._handlers.indexOf(handler);
          if (index !== -1) {
            this._handlers.splice(index, 1);
          }
        },
      };
    }
  };
  return __toCommonJS(src_exports);
})();

/**
 * @param {any} data
 * @returns {Promise<{stats: fs.Stats, symlink?: {isDangling: boolean}}>}
 */
async function handleStatRequest(data) {
  let { path: filePath } = data;

  /**
   * @type {fs.Stats | undefined}
   */
  let lstats;
  try {
    // Get symlink data
    lstats = await fs.promises.lstat(filePath);

    // If not a link, just return the stats
    if (!lstats.isSymbolicLink()) return { stats: lstats };
  } catch {
    // lstats stays undefined.
  }

  try {
    const stats = await fs.promises.stat(filePath);

    return { stats: stats, symlink: lstats?.isSymbolicLink() ? { isDangling: false } : undefined };
  } catch (error) {
    // Might be dangling symlink
    if (error.code === 'ENOENT' && lstats) {
      return { stats: lstats, symlink: { isDangling: true } };
    }

    throw error;
  }
}

class StdioTransports extends portableRpc.BaseTransports {
  constructor() {
    super();
    process.stdin.on('data', (data) => {
      for (const line of data
        .toString()
        .split('\n')
        .filter((v) => v.trim().length > 0)) {
        const parsed = JSON.parse(line);
        this.fireMessage(parsed);
      }
    });
  }

  sendMessage(/**@type {import('portablerpc').Message}*/ message) {
    process.stdout.write(JSON.stringify(message));
  }
}

const connection = portableRpc.createConnection(new StdioTransports());
connection.onRequest('stat', async (params) => {
  try {
    const result = await handleStatRequest(params);
    const ctime = result.stats.birthtime.getTime();
    const mtime = result.stats.mtime.getTime();
    const size = result.stats.size;
    const permissions = (result.stats.mode & 0o200) === 0 ? 'locked' : undefined;
    /**
     * @type {"file" | "directory" | "unknown"}
     */
    let type;
    if (result.symlink && result.symlink.isDangling) {
      type = 'unknown';
    } else if (result.stats.isFile()) {
      type = 'file';
    } else if (result.stats.isDirectory()) {
      type = 'directory';
    } else {
      type = 'unknown';
    }

    return {
      ctime,
      mtime,
      size,
      permissions,
      type,
      isSymlink: !!result.symlink,
    };
  } catch (e) {
    return { error: e.code };
  }
});

connection.onRequest('exists', async (params) => {
  try {
    await fs.promises.access(params.path);
    return { exists: true };
  } catch {
    return { exists: false };
  }
});

connection.onRequest('readdir', async (params) => {
  try {
    const result = await fs.promises.readdir(params.path, {
      withFileTypes: true,
    });

    return {
      result: result.map((dirent) => ({
        name: dirent.name,
        type: dirent.isDirectory() ? 'directory' : dirent.isFile() ? 'file' : 'unknown',
        isSymlink: dirent.isSymbolicLink(),
      })),
    };
  } catch (e) {
    return { error: e };
  }
});

// Uncomment this when WebContainer upgrades to node 20
// fs.watch('/home/projects', { recursive: true, encoding: 'utf-8' }, (event, fileName) => {
//   if (!fileName) return;

//   const exists = fs.existsSync(fileName);

//   connection.sendNotification('fileChanged', {type: event === 'change' ? 'change' : exists ? 'create' : 'delete', path: fileName});
// });

console.log('ready');
