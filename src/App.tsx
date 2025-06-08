import { useState } from 'react'
import './App.css'

function App() {
  const [searchQuery, setSearchQuery] = useState('')
  const [article, setArticle] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setArticle('')
    try {
      const res = await fetch('http://localhost:3001/api/generate-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: searchQuery }),
      })
      const data = await res.json()
      if (res.ok) {
        setArticle(data.article)
      } else {
        setError(data.error || 'Failed to generate article')
      }
    } catch (err) {
      setError('Failed to connect to backend')
    }
    setLoading(false)
  }

  return (
    <div className="wiki-container">
      <div className="wiki-content">
        <div className="wiki-logo">
          <img src="https://upload.wikimedia.org/wikipedia/donate/b/b0/Wikipedia-logo-globe-.png" alt="AutoWiki Logo" />
          <h1>AutoWiki</h1>
        </div>
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search AutoWiki..."
            className="search-input"
          />
          <button type="submit" className="search-button" disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>
        {error && <div style={{ color: 'red', marginTop: 20 }}>{error}</div>}
        {article && (
          <div style={{ marginTop: 40, textAlign: 'left', background: '#fff', padding: 24, borderRadius: 8, boxShadow: '0 2px 8px #0001', color: '#000' }}>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#000' }}>{article}</pre>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
