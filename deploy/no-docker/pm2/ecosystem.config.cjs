module.exports = {
  apps: [
    {
      name: "erp-inventory-api",
      cwd: "/srv/pms-bench/backend",
      script: "/srv/pms-bench/config/start-api.sh",
      interpreter: "/bin/sh",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: "5000"
      },
      out_file: "/srv/pms-bench/logs/api.out.log",
      error_file: "/srv/pms-bench/logs/api.err.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      max_memory_restart: "512M",
      restart_delay: 3000,
      kill_timeout: 10000
    }
  ]
};
