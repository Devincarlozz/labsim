import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { cloudflare } from "@cloudflare/vite-plugin"
import fs from 'fs'
import path from 'path'

// Small-sized server-side log plugin
function serverSideLogPlugin(): Plugin {
  const logDir = path.resolve(process.cwd(), 'server_logs')
  const logFile = path.join(logDir, 'user_activity.jsonl')
  const messagesFile = path.join(logDir, 'admin_messages.json')
  const MAX_LOG_BYTES = 250 * 1024 // 250 KB cap to guarantee small size

  function ensureDir() {
    if (!fs.existsSync(logDir)) {
      try {
        fs.mkdirSync(logDir, { recursive: true })
      } catch (err) {
        console.warn('Failed to create server_logs directory:', err)
      }
    }
  }

  function appendLogEntry(entry: any) {
    try {
      ensureDir()
      const line = JSON.stringify({
        ...entry,
        _serverReceivedAt: Date.now(),
      }) + '\n'

      // Check current size and trim if exceeds cap
      if (fs.existsSync(logFile)) {
        const stats = fs.statSync(logFile)
        if (stats.size > MAX_LOG_BYTES) {
          const content = fs.readFileSync(logFile, 'utf-8')
          const lines = content.trim().split('\n')
          // Keep the newest half of entries
          const kept = lines.slice(Math.floor(lines.length / 2)).join('\n') + '\n'
          fs.writeFileSync(logFile, kept, 'utf-8')
        }
      }

      fs.appendFileSync(logFile, line, 'utf-8')
    } catch (err) {
      console.warn('Error writing to server log:', err)
    }
  }

  function getRecentLogs(limit = 100) {
    try {
      if (!fs.existsSync(logFile)) return []
      const content = fs.readFileSync(logFile, 'utf-8')
      const lines = content.trim().split('\n').filter(Boolean)
      const parsed = lines.map((l) => {
        try {
          return JSON.parse(l)
        } catch {
          return null
        }
      }).filter(Boolean)
      return parsed.slice(-limit).reverse()
    } catch {
      return []
    }
  }

  function getAdminMessages() {
    try {
      if (!fs.existsSync(messagesFile)) {
        const defaultMessages = [
          {
            id: 'msg-welcome-lab',
            title: 'Welcome to CircuitLab Digital Electronics Lab',
            content: 'Please ensure power rails (+5V and GND) are correctly routed before activating the simulation. Breadboard circuits can be tested with the Oscilloscope and Function Generator.',
            sender: 'Bhagath Krishnan',
            senderEmail: 'bhagathkrishnan06@gmail.com',
            priority: 'important',
            category: 'lab_notice',
            createdAt: Date.now() - 3600000,
            active: true,
          },
          {
            id: 'msg-counter-assignment',
            title: 'Lab Notice: Modulo-N Counter Experiments',
            content: 'Experiment 4 counter designs using 74HC74 D-Flip Flops and 74HC08 logic gates must be verified with clock pulses from Digital IO or Function Generator.',
            sender: 'Bhagath Krishnan',
            senderEmail: 'bhagathkrishnan06@gmail.com',
            priority: 'normal',
            category: 'assignment',
            createdAt: Date.now() - 86400000,
            active: true,
          }
        ]
        ensureDir()
        fs.writeFileSync(messagesFile, JSON.stringify(defaultMessages, null, 2), 'utf-8')
        return defaultMessages
      }
      return JSON.parse(fs.readFileSync(messagesFile, 'utf-8'))
    } catch {
      return []
    }
  }

  function saveAdminMessages(messages: any[]) {
    try {
      ensureDir()
      fs.writeFileSync(messagesFile, JSON.stringify(messages, null, 2), 'utf-8')
      return true
    } catch {
      return false
    }
  }

  return {
    name: 'server-side-log-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0]

        // 1. User Activity & Workspace Log Endpoint
        if (url === '/api/log-user-data') {
          if (req.method === 'POST') {
            let body = ''
            req.on('data', chunk => { body += chunk })
            req.on('end', () => {
              try {
                const data = JSON.parse(body || '{}')
                appendLogEntry(data)
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ status: 'ok', loggedAt: Date.now() }))
              } catch (err: any) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ status: 'error', message: err?.message }))
              }
            })
            return
          }

          if (req.method === 'GET') {
            const logs = getRecentLogs(100)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ status: 'ok', count: logs.length, logs }))
            return
          }
        }

        // 2. Admin Announcements & Messages Endpoint
        if (url === '/api/admin-messages') {
          if (req.method === 'GET') {
            const msgs = getAdminMessages()
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ status: 'ok', messages: msgs }))
            return
          }

          if (req.method === 'POST') {
            let body = ''
            req.on('data', chunk => { body += chunk })
            req.on('end', () => {
              try {
                const data = JSON.parse(body || '{}')
                let current = getAdminMessages()
                if (data.action === 'add' && data.message) {
                  current = [data.message, ...current.filter((m: any) => m.id !== data.message.id)]
                } else if (data.action === 'delete' && data.id) {
                  current = current.filter((m: any) => m.id !== data.id)
                } else if (Array.isArray(data.messages)) {
                  current = data.messages
                }
                saveAdminMessages(current)
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ status: 'ok', messages: current }))
              } catch (err: any) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ status: 'error', message: err?.message }))
              }
            })
            return
          }
        }

        next()
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    cloudflare(),
    serverSideLogPlugin(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/firebase')) {
            return 'firebase-vendor'
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-vendor'
          }
        },
      },
    },
    // Increase chunk size warning threshold since simulator has rich instruments
    chunkSizeWarningLimit: 800,
  },
})