import 'dotenv/config'
import { createApp } from './app.mjs'
import { readConfig } from './config.mjs'

try {
    const config = readConfig()
    const server = createApp({ config }).listen(config.port, config.host, () => {
        console.log(JSON.stringify({ event: 'assistant_started', host: config.host, port: config.port, mode: config.mode }))
    })
    server.requestTimeout = 30_000
    server.headersTimeout = 10_000
    server.keepAliveTimeout = 5000
    server.on('error', error => {
        console.error(JSON.stringify({ event: 'assistant_start_failed', code: error.code ?? 'LISTEN_FAILED' }))
        process.exitCode = 1
    })
    let stopping = false
    const shutdown = () => {
        if (stopping)
            return
        stopping = true
        server.close(() => process.exit(0))
        setTimeout(() => process.exit(1), 30_000).unref()
    }
    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
}
catch (error) {
    // Configuration errors are authored by readConfig and contain no secret values.
    console.error(JSON.stringify({ event: 'assistant_configuration_invalid', message: error.message }))
    process.exitCode = 1
}
