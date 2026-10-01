import { Router } from 'express';
import https from 'https';
import { URL } from 'url';
import dns from 'dns';
import net from 'net';
import { requireAuth } from '../../middlewares/requireAuth';

const router = Router();

const ALLOWED_HOST = 'res.cloudinary.com';

// `hostname === ALLOWED_HOST` catches the bare domain; `.endsWith('.' + ALLOWED_HOST)`
// catches real subdomains of it. Neither can be satisfied by an attacker-controlled
// domain that merely contains the string "res.cloudinary.com" (e.g.
// res.cloudinary.com.attacker.example), unlike the previous `hostname.includes(...)`
// check this replaces.
const isAllowedHostname = (hostname: string) =>
  hostname === ALLOWED_HOST || hostname.endsWith(`.${ALLOWED_HOST}`);

// Defense-in-depth against DNS rebinding / SSRF to internal infrastructure: reject the
// request if the hostname resolves to a private, loopback, link-local, or otherwise
// non-public address, even though isAllowedHostname above already restricts the
// hostname itself to Cloudinary's real domain.
const isPrivateOrReservedIp = (ip: string): boolean => {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1') return true; // loopback
    if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true; // link-local / unique local
    if (lower.startsWith('::ffff:')) {
      const mapped = lower.slice('::ffff:'.length);
      if (net.isIPv4(mapped)) return isPrivateOrReservedIp(mapped);
    }
    return false;
  }
  return true; // not a recognizable IP - fail closed
};

// Streams an external image (e.g., Cloudinary) through the backend for authenticated
// ERP users only. Usage: GET /api/media/proxy?url=<encoded-url>
router.get('/proxy', requireAuth, async (req, res) => {
  const url = req.query.url as string;
  if (!url || !/^https:\/\//i.test(url)) {
    return res.status(400).json({ success: false, message: 'Invalid url' });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ success: false, message: 'Invalid url' });
  }

  if (!isAllowedHostname(parsed.hostname)) {
    return res.status(400).json({ success: false, message: 'Only Cloudinary URLs allowed' });
  }

  let resolvedIp: string;
  try {
    const lookup = await dns.promises.lookup(parsed.hostname);
    resolvedIp = lookup.address;
  } catch {
    return res.status(400).json({ success: false, message: 'Could not resolve host' });
  }
  if (isPrivateOrReservedIp(resolvedIp)) {
    return res.status(400).json({ success: false, message: 'Invalid url' });
  }

  return https
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
