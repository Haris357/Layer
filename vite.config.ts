import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // The Rust side has its own watcher; watching target/ also crashes Vite
    // (EBUSY) when cargo has a build-script exe locked.
    watch: { ignored: ['**/src-tauri/**'] },
  },
})
