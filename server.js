require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const Match = require('./models/Match');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT']
  }
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log('MongoDB connection error:', err));

// Routes
const matchRoutes = require('./routes/matchRoutes');
app.use('/api/matches', matchRoutes);

// Socket.io
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('startMatch', async (matchId) => {
    console.log('Socket event: startMatch', matchId);
    try {
      const match = await Match.findById(matchId);
      if (match && match.status === 'NOT_STARTED') {
        match.status = 'LIVE';
        match.startTime = new Date();
        match.elapsedMs = 0;
        await match.save();
        io.emit('matchUpdated', match);
      }
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('pauseMatch', async (matchId) => {
    console.log('Socket event: pauseMatch', matchId);
    try {
      const match = await Match.findById(matchId);
      if (match && match.status === 'LIVE') {
        match.status = 'BREAK';
        const now = new Date();
        if (match.startTime) {
          match.elapsedMs += (now.getTime() - new Date(match.startTime).getTime());
        }
        match.startTime = null;
        await match.save();
        io.emit('matchUpdated', match);
      }
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('resumeMatch', async (matchId) => {
    console.log('Socket event: resumeMatch', matchId);
    try {
      const match = await Match.findById(matchId);
      if (match && match.status === 'BREAK') {
        match.status = 'LIVE';
        match.startTime = new Date();
        await match.save();
        io.emit('matchUpdated', match);
      }
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('addEvent', async ({ matchId, type, player, team, minute, assist }) => {
    console.log('Socket event: addEvent', { matchId, type, player, team, minute, assist });
    try {
      const match = await Match.findById(matchId);
      if (match && match.status === 'LIVE') {
        const eventData = { type, player, team, minute };
        if (assist) eventData.assist = assist;
        match.events.push(eventData);
        if (type === 'goal') {
          if (team === 'home') match.homeScore += 1;
          if (team === 'away') match.awayScore += 1;
          
          if (!match.playerRatings) {
            match.playerRatings = { home: {}, away: {} };
          }
          if (!match.playerRatings[team]) {
            match.playerRatings[team] = {};
          }
          const currentRating = match.playerRatings[team][player] || 0;
          match.playerRatings[team][player] = currentRating + 1;
          match.markModified('playerRatings');
        }
        await match.save();
        io.emit('matchUpdated', match);
      }
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('updatePlayerRating', async ({ matchId, team, player, change }) => {
    console.log('Socket event: updatePlayerRating', { matchId, team, player, change });
    try {
      const match = await Match.findById(matchId);
      if (match && match.status === 'LIVE') {
        if (!match.playerRatings) {
          match.playerRatings = { home: {}, away: {} };
        }
        const currentRating = match.playerRatings[team][player] || 0;
        match.playerRatings[team][player] = currentRating + change;
        match.markModified('playerRatings');
        await match.save();
        io.emit('matchUpdated', match);
      }
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('endMatch', async (matchId) => {
    console.log('Socket event: endMatch', matchId);
    try {
      const match = await Match.findById(matchId);
      if (match && (match.status === 'LIVE' || match.status === 'BREAK')) {
        const now = new Date();
        if (match.status === 'LIVE' && match.startTime) {
          match.elapsedMs += (now.getTime() - new Date(match.startTime).getTime());
        }
        match.status = 'FINISHED';
        match.startTime = null;

        // Auto-calculate Man of the Match: score = playerRating + goalCount
        const allPlayers = [];
        const lineups = match.lineups || { home: [], away: [] };
        const ratings = match.playerRatings || { home: {}, away: {} };
        const events = match.events || [];

        for (const team of ['home', 'away']) {
          for (const player of (lineups[team] || [])) {
            const rating = (ratings[team] && ratings[team][player]) ? ratings[team][player] : 0;
            const goals = events.filter(e => e.type === 'goal' && e.player === player).length;
            const score = rating + goals;
            allPlayers.push({ player, score });
          }
        }

        if (allPlayers.length > 0) {
          allPlayers.sort((a, b) => b.score - a.score);
          // Only set MOTM if the top player has a positive score
          if (allPlayers[0].score > 0) {
            match.manOfTheMatch = allPlayers[0].player;
          }
        }

        await match.save();
        io.emit('matchUpdated', match);
      }
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('updateStats', async ({ matchId, stats }) => {
    console.log('Socket event: updateStats', { matchId, stats });
    try {
      const match = await Match.findById(matchId);
      if (match) {
        match.stats = stats;
        await match.save();
        io.emit('matchUpdated', match);
      }
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('updateLineups', async ({ matchId, lineups }) => {
    console.log('Socket event: updateLineups', { matchId, lineups });
    try {
      const match = await Match.findById(matchId);
      if (match) {
        match.lineups = lineups;
        await match.save();
        io.emit('matchUpdated', match);
      }
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('setManOfTheMatch', async ({ matchId, player }) => {
    console.log('Socket event: setManOfTheMatch', { matchId, player });
    try {
      const match = await Match.findById(matchId);
      if (match) {
        match.manOfTheMatch = player;
        await match.save();
        io.emit('matchUpdated', match);
      }
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Auto-pause first half at 45 minutes (2,700,000 ms)
// Second half runs until the admin manually ends the match — no auto-finish
setInterval(async () => {
  try {
    const liveMatches = await Match.find({ status: 'LIVE' });
    const now = new Date().getTime();
    for (const match of liveMatches) {
      if (match.startTime) {
        const currentElapsed = match.elapsedMs + (now - new Date(match.startTime).getTime());
        const firstHalfLimit = 45 * 60 * 1000;

        // Auto-pause at 45:00 only if this is the first half (elapsedMs < 45 min)
        if (match.elapsedMs < firstHalfLimit && currentElapsed >= firstHalfLimit) {
          match.status = 'BREAK';
          match.elapsedMs = firstHalfLimit;
          match.startTime = null;
          await match.save();
          io.emit('matchUpdated', match);
          console.log(`Match ${match._id} automatically paused at Half-Time (45:00).`);
        }
        // No auto-finish — second half continues past 90:00 until admin ends it manually
      }
    }
  } catch (err) {
    console.error('Error in auto-pause checker loop:', err);
  }
}, 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
