module.exports = {
  apps : [{
    name      : 'open-expenses',
    script    : 'index.js',
    watch: ['app'],
    ignore_watch : ['node_modules'],
    watch_options: {
      followSymlinks: false
    },
    env: {
      NODE_ENV: 'development'
    },
    env_production : {
      NODE_ENV: 'production'
    }
  }],

  deploy : {
    production : {
    }
  }
};
