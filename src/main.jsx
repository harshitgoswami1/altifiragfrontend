import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { readSSE } from './sse.js'
import './style.css'

const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

function sourceUrl(value) {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

function observationDate(value) {
  const date = new Date(value)
  return value && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
    : value || 'Date unavailable'
}

function App() {
  const [chatOpen, setChatOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [asked, setAsked] = useState('')
  const [answer, setAnswer] = useState('')
  const [citations, setCitations] = useState([])
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const controller = useRef(null)
  const busy = useRef(false)
  const openButton = useRef(null)
  const questionInput = useRef(null)

  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => {
    if (!chatOpen) return
    questionInput.current?.focus()
    function onEscape(event) {
      if (event.key === 'Escape') closeChat()
    }
    document.addEventListener('keydown', onEscape)
    return () => document.removeEventListener('keydown', onEscape)
  }, [chatOpen])

  function closeChat() {
    setChatOpen(false)
    openButton.current?.focus()
  }

  async function submit(event) {
    event.preventDefault()
    const text = question.trim()
    if (!text || busy.current) return

    busy.current = true
    const request = new AbortController()
    controller.current = request
    setAsked(text)
    setAnswer('')
    setCitations([])
    setError('')
    setStatus('waiting')

    try {
      const response = await fetch(`${apiBase}/v1/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ question: text }),
        signal: request.signal,
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const detail = payload?.detail
        throw new Error(typeof detail === 'string' ? detail : `Request failed (HTTP ${response.status}).`)
      }
      if (!response.body) throw new Error('This browser could not read the response stream.')

      let completed = false
      for await (const message of readSSE(response.body)) {
        if (request.signal.aborted) break
        setStatus('streaming')
        let payload
        try {
          payload = JSON.parse(message.data)
        } catch {
          throw new Error('The server sent an invalid response.')
        }
        if (message.event === 'citations') {
          setCitations(Array.isArray(payload) ? payload : [])
        } else if (message.event === 'token') {
          setAnswer(previous => previous + (typeof payload?.text === 'string' ? payload.text : ''))
        } else if (message.event === 'done') {
          completed = true
          setStatus('done')
          break
        } else if (message.event === 'error') {
          throw new Error(typeof payload?.detail === 'string' ? payload.detail : 'The response stopped unexpectedly.')
        }
      }
      if (!completed && !request.signal.aborted) throw new Error('The connection ended before the answer was complete.')
    } catch (cause) {
      if (request.signal.aborted) {
        setStatus('cancelled')
      } else {
        setError(cause instanceof Error ? cause.message : 'Unable to get an answer.')
        setStatus('error')
      }
    } finally {
      busy.current = false
      controller.current = null
    }
  }

  const active = status === 'waiting' || status === 'streaming'

  return (
    <div className="site">
      <header className="topbar">
        <div className="wordmark">altifi<span>.</span></div>
      </header>

      <main className="hero">
        <div className="hero-copy">
          <h1>Bonds and finance,<br />made clearer.</h1>
          <p>Ask about bonds and fixed deposits. Get answers grounded in the source library.</p>
        </div>
      </main>
      <footer className="site-footer">Information from indexed documents. Check sources before making financial decisions.</footer>

      <button
        ref={openButton}
        className="chat-trigger"
        type="button"
        aria-controls="chat-window"
        aria-expanded={chatOpen}
        onClick={() => chatOpen ? closeChat() : setChatOpen(true)}
      >
        {chatOpen ? 'Close chat' : 'Open chat'}
        <span className="trigger-icon" aria-hidden="true">{chatOpen ? '×' : '+'}</span>
      </button>

      {chatOpen && <aside id="chat-window" className="chat-window" aria-label="Altifi chat">
        <div className="chat-heading">
          <div>
            <span className="chat-heading-caption">Altifi research</span>
            <h2>Ask the library</h2>
          </div>
          <button className="chat-close" type="button" aria-label="Close chat" onClick={closeChat}>×</button>
        </div>

        <div className="chat-scroll">
          <div className="chat-status" role="status">
            <span className={active ? 'status-dot is-active' : 'status-dot'} aria-hidden="true" />
            {status === 'idle' && 'Ready to answer'}
            {status === 'waiting' && 'Finding sources…'}
            {status === 'streaming' && 'Writing answer…'}
            {status === 'done' && 'Answer complete'}
            {status === 'cancelled' && 'Response cancelled'}
            {status === 'error' && 'Response stopped'}
          </div>

          {status === 'idle' ? <div className="chat-empty"><p>What would you like to know?</p><span>Ask a question about bonds or fixed deposits to begin.</span></div> : <>
            <p className="asked-question">{asked}</p>
            <div className="answer-content" aria-live="polite" aria-atomic="false">
              {answer ? <p className="answer-text">{answer}</p> : <p className="answer-placeholder">
                {status === 'waiting' && 'Looking through the source library…'}
                {status === 'streaming' && 'Reading the sources…'}
                {status === 'done' && 'No answer was returned.'}
                {status === 'cancelled' && 'Response cancelled.'}
                {status === 'error' && 'No answer was returned.'}
              </p>}
            </div>
            {error && <p className="error-message" role="alert">{error}</p>}
            {active && <button className="cancel-button" type="button" onClick={() => controller.current?.abort()}>Cancel response</button>}
            {(citations.length > 0 || status === 'done') && <div className="sources-section">
              <h3>Sources</h3>
              {citations.length ? <ul className="source-list">
                {citations.map((citation, index) => {
                  const url = sourceUrl(citation.url)
                  return <li key={citation.chunk_id || index} className="source-item">
                    <span className="source-number">{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      {url ? <a href={url} target="_blank" rel="noopener noreferrer">{citation.title || url}<span aria-hidden="true"> ↗</span></a> : <span className="source-title">{citation.title || 'Untitled source'}</span>}
                      <span className="source-date">Observed {observationDate(citation.observed_at)}</span>
                    </div>
                  </li>
                })}
              </ul> : <p className="sources-empty">No sources to show.</p>}
            </div>}
          </>}
        </div>

        <form className="question-form" onSubmit={submit}>
          <label htmlFor="question">Your question</label>
          <textarea
            ref={questionInput}
            id="question"
            rows="2"
            placeholder="What is a fixed deposit?"
            value={question}
            onChange={event => setQuestion(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit(event)
            }}
            disabled={active}
          />
          <div className="form-actions">
            <span>⌘ / Ctrl + Enter</span>
            <button type="submit" disabled={active || !question.trim()}>Ask question <span aria-hidden="true">↑</span></button>
          </div>
        </form>
      </aside>}
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
