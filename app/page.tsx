export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>BJJ Atlas</h1>
      <p>The global BJJ event aggregator API.</p>
      <h2>Endpoints</h2>
      <ul>
        <li><code>GET /api/events</code> — List events (params: city, country, source, from, to, limit, offset)</li>
        <li><code>GET /api/events/search?q=keyword</code> — Full-text search</li>
      </ul>
    </main>
  );
}
