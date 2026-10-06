# altifiragfrontend

## Run locally

1. Start the backend on `http://127.0.0.1:8000` (see `../sqlagentbackend/README.md`).
2. Run `npm install`, then `npm run dev`.
3. Open the local URL printed by Vite.

The Vite development server proxies `/v1` requests to the backend, so the browser uses the frontend's origin. Set `VITE_BACKEND_TARGET` when starting Vite if the backend is elsewhere, for example `VITE_BACKEND_TARGET=http://127.0.0.1:9000 npm run dev`.

`VITE_API_BASE_URL` sets the request base path. It defaults to empty, which sends requests to `/v1/chat/stream` on the current origin. For a production deployment, configure your web server to proxy `/v1` to the backend. Cross-origin requests also work when `VITE_API_BASE_URL` is absolute and the frontend's exact origin is listed in the backend's `CORS_ORIGINS`. Use `npm run build` to create `dist/`.

Run the small stream parser check with `npm test`.
