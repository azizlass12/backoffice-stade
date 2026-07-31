const express = require('express');
const router = express.Router();
const Match = require('../models/Match');

// Get all matches
router.get('/', async (req, res) => {
  console.log('GET /api/matches');
  try {
    const matches = await Match.find().sort({ createdAt: -1 });
    res.json(matches);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get single match
router.get('/:id', async (req, res) => {
  console.log('GET /api/matches/' + req.params.id);
  try {
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ message: 'Match not found' });
    res.json(match);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create match
router.post('/', async (req, res) => {
  console.log('POST /api/matches', req.body);
  const match = new Match({
    homeTeam: req.body.homeTeam,
    awayTeam: req.body.awayTeam,
    homeColor: req.body.homeColor,
    awayColor: req.body.awayColor,
    scheduledDate: req.body.scheduledDate || null,
    lineups: req.body.lineups || { home: [], away: [] }
  });
  try {
    const newMatch = await match.save();
    res.status(201).json(newMatch);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
