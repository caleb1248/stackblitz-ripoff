import fs from 'fs';
import path from 'path';

// Prevent typescript language features from symlinking files to vscode-node-modules

const filePath = path.join(
  process.cwd(),
  'node_modules/@codingame/monaco-vscode-typescript-language-features-default-extension/resources/tsserver.web.js'
);

fs.readFile(filePath, 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading file:', err);
    return;
  }

  const result = data.replace(/\.startsWith\("\/\^\/"\)/, '.startsWith("/^/") || true');

  fs.writeFile(filePath, result, 'utf8', (err) => {
    if (err) {
      console.error('Error writing file:', err);
    } else {
      console.log('File updated successfully.');
    }
  });
});
