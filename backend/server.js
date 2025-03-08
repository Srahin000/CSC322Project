const express = require("express");
const multer = require("multer");
const fs = require("fs");
const Groq = require("groq-sdk");
const cors = require("cors");
require("dotenv").config(); // Load environment variables

const app = express();
const port = 5000;
app.use(express.json());
app.use(cors()); // Enable CORS

const path = require("path");

const groq = new Groq({ apiKey: "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" });

// Simulated user database
let users = {
  user1: { tokens: 100, savedWords: [] },
};

// Blacklist words
const blacklist = { badword: "*******", spam: "****" };

// Middleware for token check
function checkTokens(req, res, next) {
  const { username, text } = req.body;
  if (!users[username]) return res.status(400).json({ error: "User not found" });

  const wordCount = text.split(/\s+/).length;
  if (users[username].tokens < wordCount) {
    users[username].tokens = Math.floor(users[username].tokens / 2); // Penalty
    return res.status(400).json({ error: "Not enough tokens", tokens: users[username].tokens });
  }
  next();
}

// Handle text submission
app.post("/submit", checkTokens, (req, res) => {
  let { username, text } = req.body;
  let wordCount = text.split(/\s+/).length;

  // Blacklist filtering
  for (const word in blacklist) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    if (regex.test(text)) {
      users[username].tokens -= word.length;
      text = text.replace(regex, blacklist[word]);
    }
  }

  users[username].tokens -= wordCount;
  res.json({ text, tokens: users[username].tokens });
});

// Self-Correction
app.post("/self-correct", (req, res) => {
  const { username, correctedWords } = req.body;
  users[username].tokens -= Math.ceil(correctedWords.length / 2);
  res.json({ message: "Self-correction applied", tokens: users[username].tokens });
});

// LLM Correction with Groq Llama model
app.post("/llm-correct", async (req, res) => {
  const { username, text } = req.body;
  try {
    const response = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: `Correct the following text and only provide the corrected text and wrap any changes made with to the original text in <strong> tags, \n for example provided text: sad that u dod \n corrected text: <strong>Sad</strong> that <strong>you</strong> <strong>did</strong><strong>.</strong> \n Look for grammar and punctuations:\n${text}`,
        },
      ],
      model: "llama-3.3-70b-versatile",
    });

    const correctedText = response.choices[0]?.message?.content.trim() || "";
    res.json({ correctedText, tokens: users[username].tokens });
  } catch (error) {
    res.status(500).json({ error: "LLM Error", details: error.message });
  }
});

// Accepting or Rejecting LLM correction
app.post("/accept-llm-correction", (req, res) => {
  const { username, acceptedChanges } = req.body;
  users[username].tokens -= acceptedChanges;
  res.json({ message: "Corrections accepted", tokens: users[username].tokens });
});

app.post("/reject-llm-correction", (req, res) => {
  const { username, reason, superUserApproval } = req.body;
  users[username].tokens -= superUserApproval ? 1 : 5;
  res.json({ message: "Rejection processed", tokens: users[username].tokens });
});

app.listen(port, () => console.log(`Server running on port ${port}`));

//File Saving
app.post("/save-file", (req, res) => {
    const { username, text } = req.body;
  
    if (!users[username] || users[username].tokens < 5) {
      return res.status(400).json({ error: "Not enough tokens to save file" });
    }
  
    if (!text) {
      return res.status(400).json({ error: "No text provided" });
    }
  
    // Deduct 5 tokens
    users[username].tokens -= 5;
  
    // Define the file path
    const filePath = path.join(__dirname, "saved_texts", `${username}_text.txt`);
  
    // Ensure directory exists
    if (!fs.existsSync("saved_texts")) {
      fs.mkdirSync("saved_texts");
    }
  
    // Write the text to a file
    fs.writeFile(filePath, text, (err) => {
      if (err) {
        return res.status(500).json({ error: "Error saving file" });
      }
      res.json({ message: "File saved successfully", tokens: users[username].tokens });
    });
  });
