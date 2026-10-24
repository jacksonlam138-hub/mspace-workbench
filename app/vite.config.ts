/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 10241,
    proxy: {
      // 正式版服务端 MCP 适配（见 server/mcp-adapter.mjs）。
      // 未启动适配服务时，前端保持演示模式，不影响运行。
      '/api/mcp': {
        target: 'http://127.0.0.1:10243',
        changeOrigin: false,
        secure: false
      }
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
});
