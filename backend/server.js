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

// Middleware to check user type and cooldown
async function checkUserType(req, res, next) {
  const { username } = req.body;

  const { data: userProfile, error } = await supabase
    .from('profiles')
    .select('user_type, last_free_use')
    .eq('id', username)
    .single();

  if (error || !userProfile) {
    return res.status(400).json({ error: "User not found." });
  }

  // Check free user restrictions
  if (userProfile.user_type === 'free') {
    const lastUse = new Date(userProfile.last_free_use);
    const now = new Date();
    const cooldown = 3 * 60 * 1000; // 3 minutes in milliseconds

    if (now - lastUse < cooldown) {
      const remainingTime = Math.ceil((cooldown - (now - lastUse)) / 1000);
      return res.status(400).json({ 
        error: `Free users must wait 3 minutes between uses. ${remainingTime} seconds remaining.` 
      });
    }

    // Update last use time
    await supabase
      .from('profiles')
      .update({ last_free_use: now.toISOString() })
      .eq('id', username);
  }

  req.userType = userProfile.user_type;
  next();
}

// Middleware to check tokens
async function checkTokens(req, res, next) {
  const { username, text } = req.body;
  const wordCount = text.trim().split(/\s+/).length;

  const { data: userProfile, error } = await supabase
    .from('profiles')
    .select('tokens, user_type')
    .eq('id', username)
    .single();

  if (error || !userProfile) {
    return res.status(400).json({ error: "User not found or token error." });
  }

  // Check if user is free and text is more than 20 words
  if (userProfile.user_type === 'free' && wordCount > 20) {
    return res.status(400).json({ error: "Free users cannot submit more than 20 words." });
  }

  if (userProfile.tokens < wordCount) {
    // Penalty: halve the tokens
    const penaltyTokens = Math.floor(userProfile.tokens / 2);
    await supabase
      .from('profiles')
      .update({ tokens: penaltyTokens })
      .eq('id', username);

    return res.status(400).json({ error: "Not enough tokens.", tokens: penaltyTokens });
  }

  req.userTokens = userProfile.tokens;
  req.userType = userProfile.user_type;
  next();
}

// Handle text submission
app.post("/submit", checkUserType, checkTokens, async (req, res) => {
  let { username, text } = req.body;
  let wordCount = text.trim().split(/\s+/).length;
  let blacklistPenalty = 0;

  // Blacklist filtering and penalty calculation
  for (const word in blacklist) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    if (regex.test(text)) {
      const matches = text.match(regex);
      // Add penalty based on word length
      matches.forEach(match => {
        blacklistPenalty += match.length; // Each character in the blacklisted word costs 1 token
      });
      text = text.replace(regex, blacklist[word]);
    }
  }

  // Add blacklist penalty to word count
  wordCount += blacklistPenalty;

  const { error } = await supabase
    .from('profiles')
    .update({ tokens: req.userTokens - wordCount })
    .eq('id', username);

  if (error) {
    return res.status(500).json({ error: "Failed to update tokens." });
  }

  res.json({ 
    text, 
    tokens: req.userTokens - wordCount,
    blacklistPenalty
  });
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

  const wordCount = correctedWords.length;
  const cost = Math.ceil(wordCount / 2); // Half of corrected words

  if (userProfile.tokens < cost) {
    return res.status(400).json({ 
      error: `Not enough tokens for self-correction. Required: ${cost}, Available: ${userProfile.tokens}`,
      tokens: userProfile.tokens 
    });
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ tokens: userProfile.tokens - cost })
    .eq('id', username);

  if (updateError) {
    return res.status(500).json({ error: "Failed to update tokens." });
  }

  res.json({ 
    message: "Self-correction applied", 
    tokens: userProfile.tokens - cost,
    wordsCorrected: wordCount,
    tokensCharged: cost
  });
});

// LLM Correction with Groq
app.post("/llm-correct", async (req, res) => {
  const { username, text } = req.body;

  // Check if user has enough tokens
  const { data: userProfile, error } = await supabase
    .from('profiles')
    .select('tokens')
    .eq('id', username)
    .single();

  if (error || !userProfile) {
    return res.status(400).json({ error: "User not found." });
  }

  // Calculate cost based on word count
  const wordCount = text.trim().split(/\s+/).length;
  
  // If not enough tokens, cut half of current tokens
  if (userProfile.tokens < wordCount) {
    const penaltyTokens = Math.floor(userProfile.tokens / 2);
    
    // Update tokens in database
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ tokens: penaltyTokens })
      .eq('id', username);

    if (updateError) {
      return res.status(500).json({ error: "Failed to update tokens." });
    }

    return res.status(400).json({ 
      error: `Not enough tokens for LLM correction. Required: ${wordCount}, Available: ${userProfile.tokens}. Half of your tokens have been deducted as penalty.`,
      tokens: penaltyTokens,
      penaltyApplied: true
    });
  }

  try {
    const response = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: `You are a helpful assistant that corrects the grammar, punctuation, and spelling of the following text. Just return the corrected text, no other text or comments:\n${text}`,
        },
      ],
      model: "llama-3.3-70b-versatile",
    });

    const correctedText = response.choices[0]?.message?.content.trim() || "";

    // Check if text has no errors (text is identical)
    const hasNoErrors = text.trim() === correctedText.trim();
    const bonusTokens = hasNoErrors && wordCount > 10 ? Math.floor(wordCount * 0.1) : 0; // 10% bonus for perfect corrections

    // Deduct word count and add bonus if applicable
    const finalTokens = userProfile.tokens - wordCount + bonusTokens;
    
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ tokens: finalTokens })
      .eq('id', username);

    if (updateError) {
      return res.status(500).json({ error: "Failed to update tokens." });
    }

    res.json({ 
      correctedText, 
      tokens: finalTokens,
      bonusApplied: bonusTokens > 0,
      bonusAmount: bonusTokens,
      wordsProcessed: wordCount
    });
  } catch (error) {
    res.status(500).json({ error: "LLM Error", details: error.message });
  }
});

app.post("/paraphrase", async (req, res) => {
  const { username, text } = req.body;

  try {
    // Check if user has enough tokens
    const { data: userData, error: userError } = await supabase
      .from('profiles')
      .select('tokens')
      .eq('id', username)
      .single();

    if (userError || !userData) {
      return res.status(400).json({ error: "User not found.", details: userError });
    }

    if (userData.tokens < 10) {
      return res.status(400).json({ error: "Not enough tokens." });
    }

    // Call Groq API for paraphrasing
    let response;
    try {
      response = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that improves text by making it more clear, concise, and engaging while maintaining the original meaning. Just return the improved text, no other text or comments."
          },
          {
            role: "user",
            content: `Please improve this text while maintaining its core message: ${text}`
          }
        ],
        model: "llama-3.3-70b-versatile",
      });
    } catch (groqError) {
      console.error('Groq API error:', groqError);
      return res.status(500).json({ error: "Groq API error", details: groqError.message || groqError });
    }

    const paraphrasedText = response.choices?.[0]?.message?.content?.trim() || "";

    // Deduct tokens
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ tokens: userData.tokens - 10 })
      .eq('id', username);

    if (updateError) {
      console.error('Supabase update error:', updateError);
      return res.status(500).json({ error: "Failed to update tokens.", details: updateError });
    }

    res.json({
      paraphrasedText,
      tokens: userData.tokens - 10
    });
  } catch (error) {
    console.error('Paraphrase error:', error);
    res.status(500).json({ error: "Failed to paraphrase text.", details: error.message || error });
  }
});

// Handle LLM rejection submissions
app.post("/submit-rejection", async (req, res) => {
  const { user_id, text_id, original_text, llm_output, reason } = req.body;

  try {
    const { error } = await supabase
      .from('llm_rejections')
      .insert([{
        user_id,
        text_id,
        original_text,
        llm_output,
        reason,
        status: 'pending',
        created_at: new Date().toISOString()
      }]);

    if (error) throw error;

    res.json({ message: "Rejection submitted successfully" });
  } catch (error) {
    console.error('Rejection submission error:', error);
    res.status(500).json({ error: "Failed to submit rejection." });
  }
});

// Accepting LLM Correction
app.post("/accept-llm-correction", async (req, res) => {
  const { username } = req.body;

  const { data: userProfile, error } = await supabase
    .from('profiles')
    .select('tokens')
    .eq('id', username)
    .single();

  if (error || !userProfile) {
    return res.status(400).json({ error: "User not found." });
  }

  const cost = 1; // 1 token for accepting correction

  await supabase
    .from('profiles')
    .update({ tokens: userProfile.tokens - cost })
    .eq('id', username);

  res.json({ message: "Corrections accepted", tokens: userProfile.tokens - cost });
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

  const penalty = superUserApproval ? 1 : 5; // 1 token if approved, 5 if not

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

// Share file with collaborator
app.post("/share-file", async (req, res) => {
  const { username, fileId, collaboratorId } = req.body;

  const { data: userProfile, error } = await supabase
    .from('profiles')
    .select('tokens')
    .eq('id', username)
    .single();

  if (error || !userProfile) {
    return res.status(400).json({ error: "User not found." });
  }

  // Check if collaborator exists
  const { data: collaborator, error: collabError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', collaboratorId)
    .single();

  if (collabError || !collaborator) {
    return res.status(400).json({ error: "Collaborator not found." });
  }

  // Add collaboration
  const { error: shareError } = await supabase
    .from('text_collaborators')
    .insert([{
      text_id: fileId,
      user_id: collaboratorId,
      adder_id: username,
      status: 'pending'
    }]);

  if (shareError) {
    return res.status(500).json({ error: "Failed to share file." });
  }

  res.json({ message: "File shared successfully" });
});

// Accept collaboration
app.post("/accept-collaboration", async (req, res) => {
  const { username, collaborationId } = req.body;

  const { error } = await supabase
    .from('text_collaborators')
    .update({ status: 'accepted' })
    .eq('id', collaborationId)
    .eq('user_id', username);

  if (error) {
    return res.status(500).json({ error: "Failed to accept collaboration." });
  }

  res.json({ message: "Collaboration accepted" });
});

// Reject collaboration
app.post("/reject-collaboration", async (req, res) => {
  const { username, collaborationId } = req.body;

  // Charge 3 tokens for reckless inviting
  const { data: userProfile, error: userError } = await supabase
    .from('profiles')
    .select('tokens')
    .eq('id', username)
    .single();

  if (userError || !userProfile) {
    return res.status(400).json({ error: "User not found." });
  }

  const { error } = await supabase
    .from('text_collaborators')
    .update({ status: 'rejected' })
    .eq('id', collaborationId)
    .eq('user_id', username);

  if (error) {
    return res.status(500).json({ error: "Failed to reject collaboration." });
  }

  // Update tokens
  await supabase
    .from('profiles')
    .update({ tokens: userProfile.tokens - 3 })
    .eq('id', username);

  res.json({ message: "Collaboration rejected", tokens: userProfile.tokens - 3 });
});

// Handle complaints
app.post("/submit-complaint", async (req, res) => {
  const { username, complainedId, textId, reason } = req.body;

  const { error } = await supabase
    .from('complaints')
    .insert([{
      complainant_id: username,
      complained_id: complainedId,
      text_id: textId,
      reason: reason,
      status: 'pending'
    }]);

  if (error) {
    return res.status(500).json({ error: "Failed to submit complaint." });
  }

  res.json({ message: "Complaint submitted successfully" });
});

// Handle complaint response
app.post("/handle-complaint", async (req, res) => {
  const { username, complaintId, action, penalty } = req.body;

  // Check if user is super user
  const { data: userProfile, error: userError } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', username)
    .single();

  if (userError || !userProfile || userProfile.user_type !== 'super') {
    return res.status(403).json({ error: "Only super users can handle complaints." });
  }

  const { error } = await supabase
    .from('complaints')
    .update({ 
      status: 'resolved',
      resolution: action,
      penalty: penalty
    })
    .eq('id', complaintId);

  if (error) {
    return res.status(500).json({ error: "Failed to handle complaint." });
  }

  res.json({ message: "Complaint handled successfully" });
});

app.post("/free-llm-correct", async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: "No text provided" });
  }

  // Check word count for free users
  const wordCount = text.trim().split(/\s+/).length;
  if (wordCount > 20) {
    return res.status(400).json({ error: "Free users cannot submit more than 20 words." });
  }

  try {
    const response = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: `You are a helpful assistant that corrects the grammar, punctuation, and spelling of the following text. Just return the corrected text, no other text or comments:\n${text}`,
        },
      ],
      model: "llama-3.3-70b-versatile",
    });

    const correctedText = response.choices[0]?.message?.content.trim() || "";
    res.json({ correctedText });
  } catch (error) {
    console.error('Free LLM Error:', error);
    res.status(500).json({ 
      error: "LLM Error", 
      details: error.message
    });
  }
});


app.listen(port, () => console.log(`Server running on port ${port}`));