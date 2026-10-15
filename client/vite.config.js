import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// Backend that the dev server forwards Socket.IO and API requests to
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000'

export default defineConfig(({ mode }) => {
  // `npm run dev:lan` (mode "lan"): serve over HTTPS on every network interface,
  // so phones and other laptops on the same Wi-Fi get a secure context —
  // browsers only allow camera/microphone on HTTPS or localhost.
  // The certificate is self-signed: accept the browser warning once per device.
  const lan = mode === 'lan'

  return {
    plugins: [react(), lan && basicSsl()],
    server: {
      port: 5173,
      host: lan,
      // Same-origin access to the backend: other devices only need this one URL
      proxy: {
        '/socket.io': { target: BACKEND_URL, ws: true },
        '/api': BACKEND_URL,
      },
    },
  }
})
