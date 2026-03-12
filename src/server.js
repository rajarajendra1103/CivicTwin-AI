require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express   = require('express');
const cors      = require('cors');
const apiRoutes = require('./routes/api');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use('/api', apiRoutes);

// Export for Vercel
module.exports = app;

// Only listen if run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[API] 🔧  CivicTwin AI backend  →  http://localhost:${PORT}/api`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[API] ❌  Port ${PORT} already in use. Run: npx kill-port ${PORT}`);
      process.exit(1);
    }
    throw err;
  });
}
