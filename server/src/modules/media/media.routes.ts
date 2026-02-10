import { Router } from 'express';
import https from 'https';
import http from 'http';
import { URL } from 'url';

const router = Router();

// Streams an external image (e.g., Cloudinary) through the backend.
// Usage: GET /api/media/proxy?url=<encoded-url>
router.get('/proxy', (req, res) => {
  const url = req.query.url as string;
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ success: false, message: 'Invalid url' });
  }

  // Optional: restrict to Cloudinary
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('res.cloudinary.com')) {
      return res.status(400).json({ success: false, message: 'Only Cloudinary URLs allowed' });
    }
  } catch {
    return res.status(400).json({ success: false, message: 'Invalid url' });
  }

  const client = url.startsWith('https') ? https : http;
  client
    .get(url, (upstream) => {
      if (upstream.statusCode && upstream.statusCode >= 400) {
        res.status(upstream.statusCode).end();
        return;
      }
      if (upstream.headers['content-type']) {
        res.setHeader('Content-Type', upstream.headers['content-type']);
      }
      res.setHeader('Cache-Control', 'public, max-age=86400');
      upstream.pipe(res);
    })
    .on('error', (err) => {
      res.status(502).json({ success: false, message: err.message });
    });
});

export default router;
