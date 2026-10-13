import assert from 'node:assert/strict'
import test from 'node:test'
import { createConversation } from './conversation.js'
import { readSSE } from './sse.js'

const id = '825ff333-fb7e-4cb5-8c2b-a8a1437647a1'

function storage() {
  const values = new Map()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  }
}

test('captures the conversation ID from the first SSE event', async () => {
  const session = createConversation(storage())
  assert.deepEqual(session.request('First question'), { question: 'First question' })

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`event: conversation\ndata: {"conversation_id":"${id}"}\n\n`))
      controller.close()
    },
  })
  for await (const event of readSSE(stream)) {
    if (event.event === 'conversation') session.capture(JSON.parse(event.data))
  }
  assert.deepEqual(session.request('Follow-up'), { question: 'Follow-up', conversation_id: id })
})

test('includes the captured ID with each follow-up request', () => {
  const session = createConversation(storage())
  session.capture({ conversation_id: id })
  assert.deepEqual(session.request('Second'), { question: 'Second', conversation_id: id })
  assert.deepEqual(session.request('Third'), { question: 'Third', conversation_id: id })
})

test('restores the ID after a refresh in the same tab', () => {
  const tabStorage = storage()
  createConversation(tabStorage).capture({ conversation_id: id })
  assert.deepEqual(createConversation(tabStorage).request('After refresh'), {
    question: 'After refresh', conversation_id: id,
  })
})

test('new chat clears the stored ID and omits it from the next request', () => {
  const tabStorage = storage()
  const session = createConversation(tabStorage)
  session.capture({ conversation_id: id })
  session.clear()
  assert.deepEqual(session.request('New chat'), { question: 'New chat' })
  assert.deepEqual(createConversation(tabStorage).request('After refresh'), { question: 'After refresh' })
})
