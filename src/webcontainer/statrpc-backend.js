// @ts-check

const fs = require('fs');
const path = require('path');

if (process.argv.includes('--help')) {
  console.log('Gets the stats of a file. Used by the editor.');
  process.exit(0);
}

/**
 * @param {any} data
 * @returns {Promise<{stats: fs.Stats, symlink?: {isDangling: boolean}}>}
 */
async function handleStatRequest(data) {
  let { path: filePath } = data;
  filePath = path.join('/home/projects', filePath);

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

process.stdin.on('data', async (data) => {
  const parsed = JSON.parse(data.toString());
  if (parsed.type === 'stat') {
    handleStatRequest(parsed)
      .then((result) => {
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

        process.stdout.write(
          JSON.stringify({
            ctime,
            mtime,
            size,
            permissions,
            type,
            isSymlink: !!result.symlink,
            id: parsed.id,
          })
        );
      })
      .catch((e) => {
        process.stdout.write(JSON.stringify({ id: parsed.id, error: e.code }));
      });
  } else if (parsed.type === 'exists') {
    fs.promises
      .access(path.join('/home/projects', parsed.path))
      .then(() => {
        process.stdout.write(JSON.stringify({ id: parsed.id, exists: true }));
      })
      .catch(() => {
        process.stdout.write(JSON.stringify({ id: parsed.id, exists: false }));
      });
  }
});

console.log('ready');
