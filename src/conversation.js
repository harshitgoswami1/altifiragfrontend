const storageKey = 'altifi-conversation-id'

export function createConversation(storage) {
  let id = storage.getItem(storageKey)

  return {
    request(question) {
      return id ? { question, conversation_id: id } : { question }
    },
    capture(payload) {
      if (typeof payload?.conversation_id !== 'string' || !payload.conversation_id) return
      id = payload.conversation_id
      storage.setItem(storageKey, id)
    },
    clear() {
      id = null
      storage.removeItem(storageKey)
    },
  }
}
