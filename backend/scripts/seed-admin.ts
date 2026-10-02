import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

async function seedAdmin() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Missing MONGODB_URI');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('hospital_signage');
    
    const email = process.env.ADMIN_EMAIL || 'admin@vibesoft.in';
    const password = process.env.ADMIN_PASSWORD || 'password123';
    const pin = process.env.ADMIN_PIN || '123456';
    
    const passwordHash = await bcrypt.hash(password, 10);
    const pinHash = await bcrypt.hash(pin, 10);
    
    const admin = {
      email,
      passwordHash,
      pinHash,
      role: 'SUPER_ADMIN',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await db.collection('admin_users').updateOne(
      { email },
      { $set: admin },
      { upsert: true }
    );
    
    console.log(`[Seed] Admin user seeded successfully!`);
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    console.log(`PIN: ${pin}`);
    
  } catch (err) {
    console.error('[Seed] Failed to seed admin user:', err);
  } finally {
    await client.close();
  }
}

seedAdmin();
