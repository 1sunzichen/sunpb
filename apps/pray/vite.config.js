import { defineConfig } from 'vite';
export default defineConfig({base:'/pray/',server:{host:'127.0.0.1',port:5178,strictPort:true,proxy:{'/pray/api':'http://127.0.0.1:8799'}},build:{chunkSizeWarningLimit:750}});
