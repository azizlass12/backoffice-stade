const http = require('http');

http.get('http://localhost:3000/api/matches/6a591717d49f565f5ddd5294', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => console.log('Response:', res.statusCode, data));
}).on('error', (err) => console.error('Error:', err.message));
