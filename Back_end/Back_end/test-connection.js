// test-connection.js - Teste a conexão com MongoDB
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI não definida no .env');
  process.exit(1);
}

console.log('🔄 Testando conexão com MongoDB...');

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Conexão com MongoDB estabelecida com sucesso!');
    return mongoose.connection.db.listCollections().toArray();
  })
  .then((collections) => {
    console.log('📋 Collections encontradas:', collections.map(c => c.name));
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Erro na conexão:', err.message);
    process.exit(1);
  });