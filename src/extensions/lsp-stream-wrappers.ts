import type RAL from 'vscode-jsonrpc/lib/common/ral';
import { MessageTransports, ReadableStreamMessageReader, WriteableStreamMessageWriter } from 'vscode-languageclient';
import { Emitter, Event } from 'vscode/vscode/vs/base/common/event';

export function wrapReadableStream(stream: ReadableStream<string>): RAL.ReadableStream {
  const dataEmitter = new Emitter<Uint8Array>();
  const encoder = new TextEncoder();
  stream.pipeTo(
    new WritableStream({
      write(data) {
        console.log('reciving', data);
        try {
          console.log(JSON.stringify(JSON.parse(data), null, 2));
        } catch {
          console.error('failed to parse json', data);
        }
        dataEmitter.fire(encoder.encode(data));
      },
    })
  );

  return {
    onData: dataEmitter.event,
    onClose: Event.None,
    onEnd: Event.None,
    onError: Event.None,
  };
}

export function wrapWritableStream(stream: WritableStream<string>): RAL.WritableStream {
  const writer = stream.getWriter();
  const decoder = new TextDecoder();
  return {
    onClose: Event.None,
    onEnd: Event.None,
    onError: Event.None,
    write(data) {
      if (data instanceof Uint8Array) data = decoder.decode(data);
      console.log(data, data.includes('\n'));
      try {
        console.log(JSON.parse(data));
      } catch {
        console.log("can't parse", data);
      }
      return writer.write(data);
    },
    end() {
      stream.close();
    },
  };
}

export function createStreamTransports(
  readableStream: ReadableStream<string>,
  writableStream: WritableStream<string>
): MessageTransports {
  const written = new Set();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const defaultWriter = writableStream.getWriter();

  const dataEmitter = new Emitter<Uint8Array>();
  readableStream.pipeTo(
    new WritableStream({
      write(data) {
        if (written.has(data)) {
          console.log('ignoring message', data);
          return;
        }
        // try {
        //   console.log(JSON.parse(data));
        // } catch {
        //   console.error('failed to parse json', data);
        // }
        console.log('reciving', data);
        dataEmitter.fire(encoder.encode(data));
      },
    })
  );

  const reader = new ReadableStreamMessageReader({
    onData: dataEmitter.event,
    onClose: Event.None,
    onEnd: Event.None,
    onError: Event.None,
  });

  const writer = new WriteableStreamMessageWriter({
    onClose: Event.None,
    onEnd: Event.None,
    onError: Event.None,
    end() {},
    async write(data) {
      if (data instanceof Uint8Array) data = decoder.decode(data);
      written.add(data.replace("\r\n"));
      await defaultWriter.write(data.replace("\r\n", "\n\n"));
      console.log('data written', data);
    },
  });

  return { reader, writer };
}
