// server.js
const app = require('./index'); // Pull in the app without listening again

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
