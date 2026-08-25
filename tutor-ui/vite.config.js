import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Local UI -> Sentinel reverse proxy -> local Go API.
      '/api': 'http://127.0.0.1:8081',
      '/health': 'http://127.0.0.1:8081',
    },
  },
})
