# MongoDB Setup Guide

1. Create a MongoDB Atlas cluster (or any standard MongoDB deployment).
2. Create a database user with `readWrite` access strictly limited to the `hospital_signage` database. Use a secure password.
3. If using Atlas, remember to URL-encode special characters in the password.
4. Add the backend server IP (or 0.0.0.0/0 for Render/cloud deployments) to Network Access.
5. Set `MONGODB_URI` in `.env` like: `mongodb+srv://<user>:<password>@<cluster>/hospital_signage?retryWrites=true&w=majority`
6. Run migrations automatically when starting the server, or manually via `npm run db:migrate`.
7. Backups can be scheduled using Atlas Backup features or standard `mongodump` tools.
