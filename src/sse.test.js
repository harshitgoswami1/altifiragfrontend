import assert from 'node:assert/strict'
import test from 'node:test'
import { readSSE } from './sse.js'

test('reads split SSE frames, CRLF lines, and split UTF-8 text', async () => {
  const bytes = new TextEncoder().encode('event: citations\r\ndata: []\r\n\r\nevent: token\r\ndata: {"text":"₹"}\r\n\r\nevent: done\r\ndata: {}\r\n\r\n')
  const stream = new ReadableStream({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte))
      controller.close()
    },
  })
  const events = []
  for await (const event of readSSE(stream)) events.push(event)
  assert.deepEqual(events, [
    { event: 'citations', data: '[]' },
    { event: 'token', data: '{"text":"₹"}' },
    { event: 'done', data: '{}' },
  ])
})
