// Yield complete SSE messages even when reads split lines, frames, or UTF-8 characters.
export async function* readSSE(stream) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let event = 'message'
  let data = []

  function takeLine() {
    const index = buffer.search(/[\r\n]/)
    if (index < 0 || (buffer[index] === '\r' && index === buffer.length - 1)) return null
    const line = buffer.slice(0, index)
    buffer = buffer.slice(index + (buffer.slice(index, index + 2) === '\r\n' ? 2 : 1))
    return line
  }

  function handleLine(line) {
    if (line === '') {
      if (!data.length) return null
      const message = { event, data: data.join('\n') }
      event = 'message'
      data = []
      return message
    }
    if (line.startsWith(':')) return null
    const colon = line.indexOf(':')
    const field = colon < 0 ? line : line.slice(0, colon)
    let value = colon < 0 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    if (field === 'data') data.push(value)
    return null
  }

  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      if (done && buffer.endsWith('\r')) buffer += '\n'
      let line
      while ((line = takeLine()) !== null) {
        const message = handleLine(line)
        if (message) yield message
      }
      if (done) break
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
