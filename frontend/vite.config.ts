import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    svgr({
      svgrOptions: {
        icon: true,
        // This will transform your SVG to a React component
        exportType: "named",
        namedExport: "ReactComponent",
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('apexcharts') || id.includes('react-apexcharts')) return 'charts';
            if (id.includes('@mui')) return 'mui';
            if (id.includes('@fullcalendar')) return 'calendar';
            if (id.includes('@tanstack')) return 'table';
            if (id.includes('lucide-react')) return 'icons';
            if (id.includes('react-dom') || id.includes('react-router')) return 'react-vendor';
          }
        },
      },
    },
  },
});
