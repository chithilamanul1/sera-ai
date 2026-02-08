module.exports = {
    apps: [
        {
            name: 'seranex-api',
            script: 'npm',
            args: 'start',
            cwd: './',
            env: {
                NODE_ENV: 'production',
                PORT: process.env.PORT || 3000
            }
        },
        {
            name: 'seranex-bot',
            script: 'npm',
            args: 'start',
            cwd: './whatsapp-bot',
            env: {
                NODE_ENV: 'production'
            },
            // Restart rule: if it crashes, restart it
            restart_delay: 5000,
            max_restarts: 10
        }
    ]
};
