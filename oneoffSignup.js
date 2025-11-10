require('dotenv').config();
const axios = require('axios');

(async () => {
  try {
    const res = await axios.post('https://backend-32fd.onrender.com/api/signup', {
      name: 'Production Test User',
      email: 'duzihato@fxzig.com',
      password: 'TestPassword123'
    }, { timeout: 60000 });

    console.log('STATUS', res.status);
    console.log('DATA', JSON.stringify(res.data, null, 2));
  } catch (err) {
    if (err.response) {
      console.error('STATUS', err.response.status);
      console.error('DATA', JSON.stringify(err.response.data, null, 2));
    } else {
      console.error('ERROR', err.message);
    }
    process.exit(1);
  }
})();
