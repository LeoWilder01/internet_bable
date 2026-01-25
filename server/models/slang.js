const mongoose = require("mongoose");

const CommentSchema = new mongoose.Schema({
  user: String,
  text: String,
  time: String,
});

const PeriodSchema = new mongoose.Schema({
  timeRange: String,
  meaning: String,
  origin: String,
  comments: [CommentSchema],
});

const SlangSchema = new mongoose.Schema({
  term: { type: String, unique: true, lowercase: true },
  currentMeaning: String,
  periods: [PeriodSchema],
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("slang", SlangSchema);
