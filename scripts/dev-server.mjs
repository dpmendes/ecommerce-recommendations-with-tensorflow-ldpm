import http from 'node:http';
import httpProxy from 'http-proxy';
import browserSync from 'browser-sync';

const proxy = httpProxy.createProxyServer({
    target: 'http://localhost:8000',
    changeOrigin: true,
    prependPath: false
});

proxy.on('error', (error, request, response) => {
    if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: `Chroma proxy unavailable: ${error.message}` }));
});

browserSync({
    server: {
        baseDir: '.',
        middleware: [
            (request, response, next) => {
                if (!request.url.startsWith('/chroma/')) {
                    next();
                    return;
                }

                request.url = request.url.slice('/chroma'.length) || '/';
                proxy.web(request, response);
            }
        ]
    },
    files: [
        'index.html',
        'data/*.csv',
        'src/**/*.js',
        'src/**/*.html',
        'style.css'
    ],
    port: 3000
});