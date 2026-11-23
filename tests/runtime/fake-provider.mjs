// Provider test endpoint: counts requests, keeps provider-side idempotency, can drop receipts or lack a lookup API.
import { createServer } from 'node:http';
import { wavBytes } from './helpers.mjs';

// A synthesized take for generate_tts: one second of 48 kHz mono per five characters of text.
const ttsArtifact = (body) => body.tool === 'generate_tts'
  ? { artifact: { media_type: 'audio/wav', data_base64: wavBytes({ seconds: Math.max(1, Math.ceil([...(body.payload?.text ?? '')].length / 5)) }).toString('base64') } }
  : {};

export async function startProvider({ price = 60, dropReceipt = false, queryEnabled = true } = {}) {
  const jobs = new Map();
  const counts = { posts: 0, accepted: 0, queries: 0 };
  const log = [];
  const server = createServer(async (req, res) => {
    const key = req.headers['idempotency-key'];
    log.push({ method: req.method, url: req.url, key, drop_receipt: provider.dropReceipt, query_enabled: provider.queryEnabled });
    if (req.method === 'POST' && req.url === '/jobs') {
      let body = '';
      for await (const chunk of req) body += chunk;
      counts.posts += 1;
      if (!jobs.has(key)) {
        counts.accepted += 1;
        const parsed = JSON.parse(body);
        jobs.set(key, { provider_job_id: `pj-${counts.accepted}`, cost_minor: price, receipt: `rcpt-${counts.accepted}`, body: parsed, ...ttsArtifact(parsed) });
      }
      if (provider.dropReceipt) return req.socket.destroy();
      return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(jobs.get(key)));
    }
    const lookup = /^\/jobs\/(.+)$/.exec(req.url ?? '');
    if (req.method === 'GET' && lookup) {
      counts.queries += 1;
      if (!provider.queryEnabled) return res.writeHead(501).end();
      const job = jobs.get(decodeURIComponent(lookup[1]));
      return job ? res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(job)) : res.writeHead(404).end();
    }
    res.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const provider = {
    url: `http://127.0.0.1:${server.address().port}`, counts, log, jobs, dropReceipt, queryEnabled,
    close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }),
  };
  return provider;
}
