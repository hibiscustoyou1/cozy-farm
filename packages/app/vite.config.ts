import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    // 局域网可访问：手机真机调试适配效果（http://<本机IP>:5173）
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2022',
  },
});
