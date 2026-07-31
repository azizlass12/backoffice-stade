const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
  type: { type: String, enum: ['goal', 'yellow_card', 'red_card'], default: 'goal' },
  player: { type: String, required: true },
  team: { type: String, enum: ['home', 'away'], required: true },
  minute: { type: Number, required: true },
  assist: { type: String }
});

const MatchSchema = new mongoose.Schema({
  homeTeam: { type: String, required: true },
  awayTeam: { type: String, required: true },
  homeColor: { type: String, default: '#3b82f6' },
  awayColor: { type: String, default: '#ef4444' },
  homeScore: { type: Number, default: 0 },
  awayScore: { type: Number, default: 0 },
  status: { type: String, enum: ['NOT_STARTED', 'LIVE', 'BREAK', 'FINISHED'], default: 'NOT_STARTED' },
  startTime: { type: Date },
  finishedAt: { type: Date },
  scheduledDate: { type: Date },
  elapsedMs: { type: Number, default: 0 },
  stats: {
    possession: {
      home: { type: Number, default: 50 },
      away: { type: Number, default: 50 }
    },
    shots: {
      home: { type: Number, default: 0 },
      away: { type: Number, default: 0 }
    },
    shotsOnGoal: {
      home: { type: Number, default: 0 },
      away: { type: Number, default: 0 }
    },
    corners: {
      home: { type: Number, default: 0 },
      away: { type: Number, default: 0 }
    },
    fouls: {
      home: { type: Number, default: 0 },
      away: { type: Number, default: 0 }
    }
  },
  lineups: {
    home: { type: [String], default: [] },
    away: { type: [String], default: [] }
  },
  playerRatings: {
    home: { type: Object, default: {} },
    away: { type: Object, default: {} }
  },
  manOfTheMatch: { type: String, default: null },
  events: [EventSchema]
}, { timestamps: true });

module.exports = mongoose.model('Match', MatchSchema);
