import 'dotenv/config';
import dotenv from 'dotenv';
import app from './app.js';

dotenv.config();

// Portni 5050 ga qattiq belgilaymiz (hech kim xalaqit bermasligi uchun)
const PORT = 5050; 

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Server http://127.0.0.1:${PORT} da yondi 🔥`);
});