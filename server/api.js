/*
|--------------------------------------------------------------------------
| api.js -- server routes
|--------------------------------------------------------------------------
|
| This file defines the routes for your server.
|
*/

const express = require("express");

const User = require("./models/user");
const Slang = require("./models/slang");
const auth = require("./auth");
const { analyzeSlang } = require("./llm");
const { fetchAllPeriods } = require("./reddit");

const router = express.Router();
const socketManager = require("./server-socket");

router.post("/login", auth.login);
router.post("/logout", auth.logout);
router.get("/whoami", (req, res) => {
  if (!req.user) {
    // not logged in
    return res.send({});
  }

  res.send(req.user);
});

router.post("/initsocket", (req, res) => {
  // do nothing if user not logged in
  if (req.user)
    socketManager.addUser(req.user, socketManager.getSocketFromSocketID(req.body.socketid));
  res.send({});
});

const SLANG_LIMIT = 50;

// get all saved slangs
router.get("/slangs", async (req, res) => {
  try {
    const all = await Slang.find().sort({ createdAt: 1 });
    res.send(all);
  } catch (err) {
    res.status(500).send({ msg: err.message });
  }
});

// search slang - doesn't auto save
router.get("/slang/:term/stream", async (req, res) => {
  const term = req.params.term.toLowerCase().trim();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // check if already in db
    const cached = await Slang.findOne({ term });
    if (cached) {
      send("cached", { ...cached.toObject(), fromDb: true });
      send("done", {});
      return res.end();
    }

    // call llm
    send("status", { msg: "asking LLM..." });
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("missing OPENROUTER_API_KEY");

    const analysis = await analyzeSlang(term, apiKey);
    send("analysis", analysis);

    // fetch reddit
    send("status", { msg: "fetching reddit..." });
    const periods = await fetchAllPeriods(term, analysis.periods || []);

    // return but don't save yet
    const result = {
      term,
      currentMeaning: analysis.currentMeaning,
      periods,
      fromDb: false,
    };

    send("result", result);
    send("done", {});

  } catch (err) {
    send("error", { msg: err.message });
  }

  res.end();
});

// save slang to db (with limit)
router.post("/slang/save", async (req, res) => {
  try {
    const { term, currentMeaning, periods } = req.body;

    // check if already exists
    const exists = await Slang.findOne({ term });
    if (exists) {
      return res.send({ ok: true, msg: "already saved" });
    }

    // check limit
    const count = await Slang.countDocuments();
    if (count >= SLANG_LIMIT) {
      // delete oldest
      const oldest = await Slang.findOne().sort({ createdAt: 1 });
      if (oldest) {
        await Slang.deleteOne({ _id: oldest._id });
      }
    }

    // save new
    const doc = new Slang({ term, currentMeaning, periods });
    await doc.save();

    res.send({ ok: true, doc });
  } catch (err) {
    res.status(500).send({ msg: err.message });
  }
});

// anything else falls to this "not found" case
router.all("*", (req, res) => {
  console.log(`API route not found: ${req.method} ${req.url}`);
  res.status(404).send({ msg: "API route not found" });
});

module.exports = router;
