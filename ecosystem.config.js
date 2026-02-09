module.exports = {
    apps: [
        {
            name: 'seranex-api',
            script: 'npm',
            args: 'start',
            cwd: './',
            env: {
                ...process.env,
                NODE_ENV: 'production',
                PORT: process.env.PORT || 3000
            }
        },
        {
            name: 'seranex-whatsapp',
            script: 'npm',
            args: 'start',
            cwd: './whatsapp-bot',
            env: {
                ...process.env,
                NODE_ENV: 'production',
                SERANEX_API_BASE: 'http://127.0.0.1:3000'
            },
            restart_delay: 5000,
            max_restarts: 10
        },
        {
            name: 'seranex-discord',
            script: 'npm',
            args: 'start',
            cwd: './discord-bot',
            env: {
                ...process.env,
                NODE_ENV: 'production',
                SERANEX_API_BASE: 'http://127.0.0.1:3000'
            },
            restart_delay: 5000,
            max_restarts: 5
        }
    ]
};
