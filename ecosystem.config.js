module.exports = {
    apps: [
        {
            name: 'youtube-karaoke-together',
            cwd: __dirname,
            script: 'server.js',
            instances: 1,
            exec_mode: 'fork',
            autorestart: true,
            restart_delay: 5000,
            kill_timeout: 15000,
            watch: false,
            time: true,
            env: {
                NODE_ENV: 'production',
            },
        },
    ],
};
