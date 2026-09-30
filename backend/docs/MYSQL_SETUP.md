# MySQL Setup Guide

The backend requires MySQL 8 (or compatible forks like MariaDB) to store all system states.

## 1. Install MySQL
You can install MySQL locally using XAMPP (Windows) or the official MySQL 8 installer. 

## 2. Create the Database and User
Open your MySQL terminal or phpMyAdmin and run the following commands to create the database with the correct character sets and set up a least-privilege user.

```sql
CREATE DATABASE IF NOT EXISTS hospital_signage CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'jjm_user'@'localhost' IDENTIFIED BY 'STRONG_PASSWORD_HERE';

GRANT ALL PRIVILEGES ON hospital_signage.* TO 'jjm_user'@'localhost';

FLUSH PRIVILEGES;
```

## 3. Hosted MySQL / SSL Setup
If you are using a cloud-hosted MySQL provider (e.g. AWS RDS, DigitalOcean, PlanetScale):
- Change `DB_HOST` in your `.env` to the remote URL.
- Set `DB_SSL=true` if required.
- If you need a specific CA certificate, place the path or the certificate content in `DB_SSL_CA`.

## 4. Run Migrations
After setting up the database and copying `.env.example` to `.env` with correct credentials, you can run migrations to initialize the schema:

```bash
# This will safely run all missing migrations from src/db/migrations/
npm run db:migrate
```

To view the database migration status:
```bash
npm run db:status
```
