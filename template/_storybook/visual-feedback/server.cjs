#!/usr/bin/env node
/**
 * Visual Feedback — local annotation server
 *
 * Listens on http://localhost:6007 (override with VF_PORT env).
 * Accepts annotations from the Storybook overlay and writes them to
 * <projectRoot>/.loop/annotations/<ts>-<storyId>.json so dev-proto
 * can pick them up on the next iteration.
 *
 * Zero deps — pure Node http.
 */

const http = require('http')
const fs = require('fs')
const path = require('path')

const PORT = Number(process.env.VF_PORT) || 6007
const ORIGIN = process.env.VF_ORIGIN || 'http://localhost:6006'
const ANNOTATIONS_DIR = path.resolve(process.cwd(), '.loop/annotations')
const MAX_BODY_BYTES = 1_000_000
const MAX_LIST_ITEMS = 200
const LOOPBACK_ADDRS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

function isLoopback(req) {
  const addr = req.socket && req.socket.remoteAddress
  return addr ? LOOPBACK_ADDRS.has(addr) : false
}

function ensureDir() {
  if (!fs.existsSync(ANNOTATIONS_DIR)) {
    fs.mkdirSync(ANNOTATIONS_DIR, { recursive: true })
  }
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function send(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function safeSlug(input) {
  return String(input || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function resolveAnnotationPath(rawName) {
  const safe = path.basename(rawName)
  if (safe !== rawName) return null
  if (!safe.endsWith('.json')) return null
  const full = path.resolve(ANNOTATIONS_DIR, safe)
  const rel = path.relative(ANNOTATIONS_DIR, full)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null
  return { safe, full }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    req.on('data', (c) => {
      total += c.length
      if (total > MAX_BODY_BYTES) {
        req.destroy()
        reject(new Error('request body too large'))
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function listAnnotations() {
  ensureDir()
  const allFiles = fs
    .readdirSync(ANNOTATIONS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
  const truncated = allFiles.length > MAX_LIST_ITEMS
  const files = truncated ? allFiles.slice(-MAX_LIST_ITEMS) : allFiles
  const annotations = files.map((file) => {
    const full = path.join(ANNOTATIONS_DIR, file)
    const stat = fs.statSync(full)
    let body = null
    try {
      body = JSON.parse(fs.readFileSync(full, 'utf-8'))
    } catch (err) {
      console.warn(`[visual-feedback] failed to parse ${file}:`, err.message)
      body = { _parseError: String(err) }
    }
    return { file, size: stat.size, mtime: stat.mtime.toISOString(), ...body }
  })
  return { annotations, total: allFiles.length, truncated, limit: MAX_LIST_ITEMS }
}

const server = http.createServer(async (req, res) => {
  setCors(res)

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  const url = new URL(req.url, `http://localhost:${PORT}`)

  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      send(res, 200, { ok: true, port: PORT, dir: ANNOTATIONS_DIR })
      return
    }

    if (req.method === 'GET' && url.pathname === '/list') {
      send(res, 200, listAnnotations())
      return
    }

    if (req.method === 'POST' && url.pathname === '/save') {
      const body = await readBody(req)
      if (!body.feedback || typeof body.feedback !== 'string') {
        send(res, 400, { error: 'feedback is required' })
        return
      }
      ensureDir()
      const now = new Date()
      const ts = now.toISOString().replace(/[:.]/g, '-')
      const storyPart = safeSlug(body.storyId || body.storyTitle)
      const id = `vf-${now.getTime()}`
      const file = `${ts}-${storyPart || 'na'}-${id}.json`
      const payload = {
        id,
        createdAt: now.toISOString(),
        storyId: body.storyId || null,
        storyTitle: body.storyTitle || null,
        url: body.url || null,
        element: body.element || null,
        feedback: body.feedback,
      }
      fs.writeFileSync(path.join(ANNOTATIONS_DIR, file), JSON.stringify(payload, null, 2))
      send(res, 201, { ok: true, file, id })
      return
    }

    if (req.method === 'DELETE' && url.pathname.startsWith('/annotations/')) {
      const rawName = decodeURIComponent(url.pathname.slice('/annotations/'.length))
      const resolved = resolveAnnotationPath(rawName)
      if (!resolved) {
        send(res, 400, { error: 'invalid filename' })
        return
      }
      if (!fs.existsSync(resolved.full)) {
        send(res, 404, { error: 'not found' })
        return
      }
      fs.unlinkSync(resolved.full)
      send(res, 200, { ok: true })
      return
    }

    if (req.method === 'PUT' && url.pathname.startsWith('/annotations/')) {
      const rawName = decodeURIComponent(url.pathname.slice('/annotations/'.length))
      const resolved = resolveAnnotationPath(rawName)
      if (!resolved) {
        send(res, 400, { error: 'invalid filename' })
        return
      }
      if (!fs.existsSync(resolved.full)) {
        send(res, 404, { error: 'not found' })
        return
      }
      const body = await readBody(req)
      if (!body.feedback || typeof body.feedback !== 'string') {
        send(res, 400, { error: 'feedback is required' })
        return
      }
      const existing = JSON.parse(fs.readFileSync(resolved.full, 'utf-8'))
      const updated = {
        ...existing,
        feedback: body.feedback,
        updatedAt: new Date().toISOString(),
      }
      fs.writeFileSync(resolved.full, JSON.stringify(updated, null, 2))
      send(res, 200, { ok: true, file: resolved.safe })
      return
    }

    if (req.method === 'POST' && url.pathname === '/clear') {
      if (!isLoopback(req)) {
        send(res, 403, { error: 'forbidden: loopback only' })
        return
      }
      ensureDir()
      const archived = path.resolve(ANNOTATIONS_DIR, `../annotations-archive/${Date.now()}`)
      fs.mkdirSync(archived, { recursive: true })
      const files = fs.readdirSync(ANNOTATIONS_DIR).filter((f) => f.endsWith('.json'))
      files.forEach((file) => {
        fs.renameSync(path.join(ANNOTATIONS_DIR, file), path.join(archived, file))
      })
      send(res, 200, { ok: true, archived, moved: files.length })
      return
    }

    send(res, 404, { error: 'not found', method: req.method, path: url.pathname })
  } catch (err) {
    const message = err && err.message ? err.message : String(err)
    const status = message === 'request body too large' ? 413 : 500
    console.error('[visual-feedback]', req.method, url.pathname, '→', message)
    send(res, status, { error: message })
  }
})

server.listen(PORT, () => {
  ensureDir()
  console.log(`[visual-feedback] listening on http://localhost:${PORT}`)
  console.log(`[visual-feedback] writing to ${ANNOTATIONS_DIR}`)
  console.log(`[visual-feedback] allowed origin: ${ORIGIN}`)
})
