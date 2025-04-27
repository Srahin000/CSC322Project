const express = require("express");
const multer = require("multer");
const fs = require("fs");
const Groq = require("groq-sdk");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config(); 

const app = express();
const port = 5000;
app.use(express.json());
app.use(cors());


const path = require("path");

// Groq API

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY});

// Supabase setup
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);


// Blacklist words
const blacklist = { badword: "*******", spam: "****" };

// Middleware to check tokens
async function checkTokens(req, res, next) {
  const { username, text } = req.body;
  const wordCount = text.trim().split(/\s+/).length;

  const { data: userProfile, error } = await supabase
    .from('profiles')
    .select('tokens')
    .eq('id', username)
    .single();

  if (error || !userProfile) {
    return res.status(400).json({ error: "User not found or token error." });
  }

  if (userProfile.tokens < wordCount) {
    // Penalty: halve the tokens
    await supabase
      .from('profiles')
      .update({ tokens: Math.floor(userProfile.tokens / 2) })
      .eq('id', username);

    return res.status(400).json({ error: "Not enough tokens.", tokens: Math.floor(userProfile.tokens / 2) });
  }

  req.userTokens = userProfile.tokens;
  next();
}

// Handle text submission
app.post("/submit", checkTokens, async (req, res) => {
  let { username, text } = req.body;
  let wordCount = text.trim().split(/\s+/).length;

  // Blacklist filtering
  for (const word in blacklist) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    if (regex.test(text)) {
      wordCount += text.match(regex).length; // Add penalties for blacklist words
      text = text.replace(regex, blacklist[word]);
    }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ tokens: req.userTokens - wordCount })
    .eq('id', username);

  if (error) {
    return res.status(500).json({ error: "Failed to update tokens." });
  }

  res.json({ text, tokens: req.userTokens - wordCount });
});

// Self-Correction
app.post("/self-correct", async (req, res) => {
  const { username, correctedWords } = req.body;

  const { data: userProfile, error } = await supabase
    .from('profiles')
    .select('tokens')
    .eq('id', username)
    .single();

  if (error || !userProfile) {
    return res.status(400).json({ error: "User not found." });
  }

  const cost = Math.ceil(correctedWords.length / 2);

  await supabase
    .from('profiles')
    .update({ tokens: userProfile.tokens - cost })
    .eq('id', username);

  res.json({ message: "Self-correction applied", tokens: userProfile.tokens - cost });
});

// LLM Correction with Groq
app.post("/llm-correct", async (req, res) => {
  const { username, text } = req.body;

  try {
    const response = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: `Correct the following text and only provide the corrected text and wrap any changes made with to the original text in <strong> tags. Look for grammar and punctuations:\n${text}`,
        },
      ],
      model: "llama-3.3-70b-versatile",
    });

    const correctedText = response.choices[0]?.message?.content.trim() || "";

    const { data: userProfile, error } = await supabase
      .from('profiles')
      .select('tokens')
      .eq('id', username)
      .single();

    if (error || !userProfile) {
      return res.status(400).json({ error: "User not found." });
    }

    res.json({ correctedText, tokens: userProfile.tokens });
  } catch (error) {
    res.status(500).json({ error: "LLM Error", details: error.message });
  }
});

// Accepting LLM Correction
app.post("/accept-llm-correction", async (req, res) => {
  const { username, acceptedChanges } = req.body;

  const { data: userProfile, error } = await supabase
    .from('profiles')
    .select('tokens')
    .eq('id', username)
    .single();

  if (error || !userProfile) {
    return res.status(400).json({ error: "User not found." });
  }

  await supabase
    .from('profiles')
    .update({ tokens: userProfile.tokens - acceptedChanges })
    .eq('id', username);

  res.json({ message: "Corrections accepted", tokens: userProfile.tokens - acceptedChanges });
});

// Rejecting LLM Correction
app.post("/reject-llm-correction", async (req, res) => {
  const { username, reason, superUserApproval } = req.body;

  const { data: userProfile, error } = await supabase
    .from('profiles')
    .select('tokens')
    .eq('id', username)
    .single();

  if (error || !userProfile) {
    return res.status(400).json({ error: "User not found." });
  }

  const penalty = superUserApproval ? 1 : 5;

  await supabase
    .from('profiles')
    .update({ tokens: userProfile.tokens - penalty })
    .eq('id', username);

  res.json({ message: "Rejection processed", tokens: userProfile.tokens - penalty });
});

// Purchase tokens
app.post("/purchase-tokens", async (req, res) => {
  const { username, tokensToAdd } = req.body;

  if (!tokensToAdd || tokensToAdd <= 0) {
    return res.status(400).json({ error: "Invalid token amount." });
  }

  const { data: userProfile, error } = await supabase
    .from('profiles')
    .select('tokens')
    .eq('id', username)
    .single();

  if (error || !userProfile) {
    return res.status(400).json({ error: "User not found." });
  }

  const newTokenCount = userProfile.tokens + tokensToAdd;

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ tokens: newTokenCount })
    .eq('id', username);

  if (updateError) {
    return res.status(500).json({ error: "Failed to update tokens." });
  }

  res.json({ message: "Tokens purchased successfully.", tokens: newTokenCount });
});


// Save file
app.post("/save-file", async (req, res) => {
  const { username, text } = req.body;

  const { data: userProfile, error } = await supabase
    .from('profiles')
    .select('tokens')
    .eq('id', username)
    .single();

  if (error || !userProfile) {
    return res.status(400).json({ error: "User not found." });
  }

  if (userProfile.tokens < 5) {
    return res.status(400).json({ error: "Not enough tokens to save file." });
  }

  await supabase
    .from('profiles')
    .update({ tokens: userProfile.tokens - 5 })
    .eq('id', username);

  const filePath = path.join(__dirname, "saved_texts", `${username}_text.txt`);

  if (!fs.existsSync("saved_texts")) {
    fs.mkdirSync("saved_texts");
  }

  fs.writeFile(filePath, text, (err) => {
    if (err) {
      return res.status(500).json({ error: "Error saving file" });
    }
    res.json({ message: "File saved successfully", tokens: userProfile.tokens - 5 });
  });
});

app.listen(port, () => console.log(`Server running on port ${port}`));
