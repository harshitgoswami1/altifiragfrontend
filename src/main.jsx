import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createConversation } from './conversation.js'
import { mergeCitations, readSSE } from './sse.js'
import './style.css'

const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const exampleQuestions = [
  'How many bonds are available to invest in?',
  'Show bonds issued by HDFC Bank',
  'Which bonds have the highest yield?',
]

function sourceUrl(value) {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

function ChatTurn({ asked, answer, citations, error, status, active, onCancel }) {
  return <div className="chat-turn">
    <p className="asked-question">{asked}</p>
    <div className="answer-content" aria-live={active ? 'polite' : 'off'} aria-atomic="false">
      {answer ? <p className="answer-text">{answer}</p> : <p className="answer-placeholder">
        {status === 'waiting' && 'Looking through the bond database…'}
        {status === 'streaming' && 'Reading the matching records…'}
        {status === 'done' && 'No answer was returned.'}
        {status === 'cancelled' && 'Response cancelled.'}
        {status === 'error' && 'No answer was returned.'}
      </p>}
    </div>
    {error && <p className="error-message" role="alert">{error}</p>}
    {active && <button className="cancel-button" type="button" onClick={onCancel}>Cancel response</button>}
    {(citations.length > 0 || status === 'done') && <div className="sources-section">
      <h3>Source records</h3>
      {citations.length ? <ul className="source-list">
        {citations.map((citation, index) => {
          const url = sourceUrl(citation.url)
          return <li key={citation.url || index} className="source-item">
            <span className="source-number">{String(index + 1).padStart(2, '0')}</span>
            <div>
              {url ? <a href={url} target="_blank" rel="noopener noreferrer">{citation.title || url}<span aria-hidden="true"> ↗</span></a> : <span className="source-title">{citation.title || 'Untitled source'}</span>}
              {url && <span className="source-meta">Open source record</span>}
            </div>
          </li>
        })}
      </ul> : <p className="sources-empty">No sources to show.</p>}
    </div>}
  </div>
}

function App() {
  const [chatOpen, setChatOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [asked, setAsked] = useState('')
  const [answer, setAnswer] = useState('')
  const [citations, setCitations] = useState([])
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [history, setHistory] = useState([])
  const [conversation] = useState(() => createConversation(sessionStorage))
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

  function newChat() {
    conversation.clear()
    setHistory([])
    setAsked('')
    setQuestion('')
    setAnswer('')
    setCitations([])
    setError('')
    setStatus('idle')
    questionInput.current?.focus()
  }

  async function submit(event) {
    event.preventDefault()
    const text = question.trim()
    if (!text || busy.current) return

    busy.current = true
    const request = new AbortController()
    controller.current = request
    if (asked) setHistory(previous => [...previous, { asked, answer, citations, error, status }])
    setAsked(text)
    setQuestion('')
    setAnswer('')
    setCitations([])
    setError('')
    setStatus('waiting')

    try {
      const response = await fetch(`${apiBase}/v1/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(conversation.request(text)),
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
        if (message.event === 'conversation') {
          conversation.capture(payload)
        } else if (message.event === 'citations') {
          setCitations(previous => mergeCitations(previous, payload))
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
        <img className="topbar-logo" src="/altifi-logo-dark.png" alt="Altifi by Northern Arc" />
      </header>

      <main className="hero">
        <div className="hero-copy">
          <span className="hero-kicker">Read-only bond intelligence</span>
          <h1>Invest in Bonds<br />Earn 8-14%* p.a.<br />monthly fixed returns</h1>
          <p>Search the bond database in plain English. Look up an ISIN, compare issuer records, check yields, or count bonds open for investment.</p>
          <div className="example-questions" aria-label="Example questions">
            {exampleQuestions.map(example => <button key={example} type="button" onClick={() => {
              setQuestion(example)
              setChatOpen(true)
            }}>{example}</button>)}
          </div>
        </div>
      </main>
      <footer className="site-footer">Answers use a read-only bond database. Verify source records before making financial decisions.</footer>

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
          <img className="chat-logo" src="/altifi-logo.png" alt="Altifi by Northern Arc" />
          <div className="chat-heading-actions">
            <button className="new-chat" type="button" onClick={newChat} disabled={active}>New chat</button>
            <button className="chat-close" type="button" aria-label="Close chat" onClick={closeChat}>×</button>
          </div>
        </div>

        <div className="chat-scroll">
          <div className="chat-status" role="status">
            <span className={active ? 'status-dot is-active' : 'status-dot'} aria-hidden="true" />
            {status === 'idle' && 'Ready to answer'}
            {status === 'waiting' && 'Querying bond records…'}
            {status === 'streaming' && 'Writing answer…'}
            {status === 'done' && 'Answer complete'}
            {status === 'cancelled' && 'Response cancelled'}
            {status === 'error' && 'Response stopped'}
          </div>

          {status === 'idle' ? <div className="chat-empty"><div className="bot-intro"><h2>Your bond research assistant</h2><p>Ask about issuers, ISINs, yields, or bonds open for investment.</p></div></div> : <>
            {history.map((turn, index) => <ChatTurn key={index} {...turn} active={false} />)}
            <ChatTurn asked={asked} answer={answer} citations={citations} error={error} status={status} active={active} onCancel={() => controller.current?.abort()} />
          </>}
        </div>

        <form className="question-form" onSubmit={submit}>
          <label className="visually-hidden" htmlFor="question">Your question</label>
          <div className="composer">
            <input
              ref={questionInput}
              id="question"
              type="text"
              placeholder="Ask about a bond…"
              value={question}
              onChange={event => setQuestion(event.target.value)}
              maxLength={4000}
              disabled={active}
            />
            <button className="send-button" type="submit" aria-label="Send question" disabled={active || !question.trim()}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 19V5m-6 6 6-6 6 6" />
              </svg>
            </button>
          </div>
        </form>
      </aside>}
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
