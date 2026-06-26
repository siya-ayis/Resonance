import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // listen on 0.0.0.0 so a phone on the LAN / a tunnel can reach it
    // Allow the dev server to be reached through Cloudflare quick tunnels
    // (used to test in Expo Go on a phone over corporate / client-isolated Wi-Fi)
    // and over the local network. Leading dot = match any subdomain.
    allowedHosts: ['.trycloudflare.com', '.ngrok.io', '.ngrok-free.app', 'localhost'],
  },
})
