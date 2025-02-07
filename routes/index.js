const express = require('express');
const router = express.Router();
const { logRequests } = require('../middleware/requestSRC');

// Apply middleware to all routes
router.use(logRequests);

// Define routes
router.get('/', (req, res) => {
  res.send('Welcome to RequestSRC Middleware Example!');
});

router.post('/register', (req, res) => {
  res.send('User registration logged.');
});

router.delete('/delete-account', (req, res) => {
  res.send('Account deletion logged.');
});

module.exports = router;
