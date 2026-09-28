import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    proxy: {
      '/v1': {
        target: process.env.VITE_BACKEND_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
