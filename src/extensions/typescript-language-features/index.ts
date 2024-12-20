import webContainer from '../../webcontainer/init';
import {
  BaseLanguageClient,
  MessageTransports,
  ReadableStreamMessageReader,
  WriteableStreamMessageWriter,
} from 'vscode-languageclient';
import { createStreamTransports, wrapReadableStream, wrapWritableStream } from '../lsp-stream-wrappers';

export async function applyInternals() {
  const shellScript = `
cd /home/.editor-internal
npm i typescript typescript-language-server
`;
  webContainer.fs.writeFile('init-typescript-features.sh', shellScript);
  const process = await webContainer.spawn('sh', ['init-typescript-features.sh']);
  process.output.pipeTo(
    new WritableStream({
      write(data) {
        console.log(data);
      },
    })
  );

  await process.exit;
}

export function activateServer() {
  class TypescriptLanguageClient extends BaseLanguageClient {
    protected async createMessageTransports(): Promise<MessageTransports> {
      const process = await webContainer.spawn('node', [
        '../.editor-internal/node_modules/.bin/typescript-language-server',
        '--stdio',
      ]);
      return createStreamTransports(process.output, process.input);
    }
  }

  const client = new TypescriptLanguageClient('typescript-client', 'Typescript Language Client', {
    documentSelector: ['typescript', 'javascript'],
  });
  client.start();
}
