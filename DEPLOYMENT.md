# Deployment Guide - ERP Inventory System

## Prerequisites

- Docker and Docker Compose installed
- Git installed
- Node.js 20+ (for local development)
- PostgreSQL 16+ (if running without Docker)

## Quick Start (Docker Deployment)

### 1. Clone the Repository

```bash
git clone <repository-url>
cd Erp-Inventory
```

### 2. Environment Configuration

Create environment files:

**For Server (`server/.env.docker`):**
```env
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://postgres:postgres@db:5432/inventorydb
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=inventorydb
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=7d
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

**For Frontend (`frontend/.env.docker`):**
```env
VITE_API_URL=http://localhost:5000/api
```

### 3. Start the Application

```bash
# Build and start all containers
docker-compose up --build -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

### 4. Access the Application

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:5000/api
- **Health Check:** http://localhost:5000/api/health

## Deployment Steps for Team Members

When pulling latest changes from GitHub:

### Step 1: Pull Latest Code

```bash
git pull origin main
```

### Step 2: Stop Existing Containers

```bash
docker-compose down
```

### Step 3: Rebuild and Start

```bash
docker-compose up --build -d
```

### Step 4: Verify Deployment

```bash
# Check all containers are healthy
docker-compose ps

# Check server logs for any errors
docker-compose logs server --tail=50

# Test the health endpoint
curl http://localhost:5000/api/health
```

## Database Migrations

### Automatic Migration

Migrations run automatically when the server container starts. The server will:

1. Connect to PostgreSQL
2. Create the `ims` schema if it doesn't exist
3. Run all pending migrations in order
4. Start the API server

### Migration Order

Migrations are executed in alphabetical order by filename. They are tracked in the `schema_migrations` table.

### Check Migration Status

```bash
docker-compose exec db psql -U postgres -d inventorydb -c "SELECT * FROM ims.schema_migrations ORDER BY applied_at DESC LIMIT 10;"
```

### Manual Migration (if needed)

```bash
# Access the database
docker-compose exec db psql -U postgres -d inventorydb

# Run a specific migration
\i /app/sql/20260219_fix_schema_mismatches.sql
```

## Troubleshooting

### Issue: Server keeps restarting

**Solution:**
```bash
# Check server logs
docker-compose logs server --tail=100

# Common causes:
# - Database connection failed
# - Migration error
# - Missing environment variables
```

### Issue: Database migration errors

**Solution:**
```bash
# Check which migrations ran
docker-compose logs server | grep -i "migration"

# Reset database (WARNING: Destroys all data)
docker-compose down -v
docker-compose up --build -d
```

### Issue: Frontend can't connect to backend

**Solution:**
1. Check frontend environment variables in `frontend/.env.docker`
2. Verify `VITE_API_URL` points to correct backend URL
3. Check if backend is running: `curl http://localhost:5000/api/health`

### Issue: Missing columns errors

**Solution:**
The `20260219_fix_schema_mismatches.sql` migration should fix this automatically. If issues persist:

```bash
# Restart server to re-run migrations
docker-compose restart server

# Verify schema
docker-compose exec server bash
cd /app
PGPASSWORD=postgres psql -h db -U postgres -d inventorydb -f sql/check_schema.sql
```

## Production Deployment

### Environment Variables

Update these for production:

```env
# Server
NODE_ENV=production
JWT_SECRET=<strong-random-secret>
DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<database>

# Frontend
VITE_API_URL=https://your-api-domain.com/api
```

### Security Checklist

- [ ] Change default database passwords
- [ ] Use strong JWT secret
- [ ] Enable HTTPS/SSL
- [ ] Configure CORS properly
- [ ] Set up database backups
- [ ] Configure firewall rules
- [ ] Use environment-specific .env files
- [ ] Review and remove any default/demo credentials

### Database Backup

```bash
# Create backup
docker-compose exec db pg_dump -U postgres inventorydb > backup_$(date +%Y%m%d).sql

# Restore backup
docker-compose exec -T db psql -U postgres inventorydb < backup_20260214.sql
```

## Development Setup

### Local Development (without Docker)

1. **Install Dependencies:**
   ```bash
   # Server
   cd server
   npm install

   # Frontend
   cd ../frontend
   npm install
   ```

2. **Setup PostgreSQL Database:**
   ```bash
   createdb inventorydb
   psql inventorydb < server/sql/complete_inventory_erp_schema.sql
   ```

3. **Run Migrations:**
   ```bash
   cd server
   npm run migrate
   ```

4. **Start Development Servers:**
   ```bash
   # Terminal 1 - Backend
   cd server
   npm run dev

   # Terminal 2 - Frontend
   cd frontend
   npm run dev
   ```

## Monitoring and Logs

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f server
docker-compose logs -f frontend
docker-compose logs -f db

# Last N lines
docker-compose logs --tail=100 server
```

### Container Resource Usage

```bash
docker stats
```

### Health Checks

All services have health checks configured:

```bash
# Check health status
docker-compose ps

# Services should show (healthy) status
```

## Update Process

### For Minor Updates (Code Changes)

```bash
git pull origin main
docker-compose restart server frontend
```

### For Major Updates (Schema Changes)

```bash
git pull origin main
docker-compose down
docker-compose up --build -d
```

## Rollback

If a deployment causes issues:

```bash
# Rollback code
git checkout <previous-commit-hash>

# Rebuild and restart
docker-compose down
docker-compose up --build -d

# Or restore database from backup
docker-compose exec -T db psql -U postgres inventorydb < backup_<date>.sql
```

## Support and Maintenance

### Regular Maintenance Tasks

1. **Weekly:**
   - Check logs for errors
   - Verify all services are healthy
   - Review disk space usage

2. **Monthly:**
   - Create database backups
   - Review and clean old logs
   - Update dependencies if needed

3. **Quarterly:**
   - Security updates
   - Performance review
   - Database optimization

### Getting Help

1. Check the logs first
2. Review this deployment guide
3. Check `SCHEMA_FIXES.md` for database issues
4. Contact the development team

## Common Commands Reference

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# Rebuild and start
docker-compose up --build -d

# View logs
docker-compose logs -f [service]

# Execute command in container
docker-compose exec server bash
docker-compose exec db psql -U postgres inventorydb

# Check service status
docker-compose ps

# Restart specific service
docker-compose restart server

# Remove volumes (WARNING: Deletes data)
docker-compose down -v
```
