import { useState, useEffect } from "react";
import axios from "axios";
import DOMPurify from "dompurify"; 
import { saveAs } from "file-saver"; 
import { diffWords } from "diff"; 
import supabase from "../config/supabaseClient"; // Import Supabase client!
import { useParams } from "react-router-dom"; // 🆕
import { useNavigate } from "react-router-dom";


export default function TextCorrectionApp() {
  const navigate = useNavigate(); // 🆕
  const [text, setText] = useState("");
  const [tokens, setTokens] = useState(null); // Initially null
  const [correctedText, setCorrectedText] = useState(null);
  const [error, setError] = useState(null);
  const [showCorrection, setShowCorrection] = useState(false);
  const [differences, setDifferences] = useState(""); 
  const [userId, setUserId] = useState(null); // Save user ID
  const { fileId } = useParams(); // 🆕
  const [title, setTitle] = useState("");

  // Fetch user session + token balance when app loads
  useEffect(() => {
    const fetchUserData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError("No active session");
        return;
      }
      setUserId(session.user.id);

      const { data, error } = await supabase
        .from('profiles')
        .select('tokens')
        .eq('id', session.user.id)
        .single();

      if (error) {
        setError("Failed to load user tokens.");
      } else {
        setTokens(data.tokens);
      }
    };

    fetchUserData();
  }, []);

  useEffect(() => {
    const fetchUserData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError("No active session");
        return;
      }
      setUserId(session.user.id);

      // Fetch tokens
      const { data, error } = await supabase
        .from('profiles')
        .select('tokens')
        .eq('id', session.user.id)
        .single();

      if (error) {
        setError("Failed to load user tokens.");
      } else {
        setTokens(data.tokens);
      }

      // If editing an existing file
      if (fileId) {
        const { data: file, error: fileError } = await supabase
          .from('texts')
          .select('title, content')
          .eq('id', fileId)
          .single();

        if (fileError) {
          setError("Failed to load the file.");
        } else {
          setTitle(file.title);
          setText(file.content);
        }
      }
    };

    fetchUserData();
  }, [fileId]);

  const handleSaveToSupabase = async () => {
    if (!title) {
      alert("Please enter a title for your file!");
      return;
    }
  
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setError("No active session");
      return;
    }
  
    try {
      if (fileId) {
        // Update existing file
        await supabase
          .from('texts')
          .update({ title, content: text, updated_at: new Date().toISOString() })
          .eq('id', fileId);
      } else {
        // Create new file
        await supabase
          .from('texts')
          .insert([{ user_id: session.user.id, title, content: text }]);
      }
      alert("File saved successfully!");
    } catch (error) {
      console.error(error);
      alert("Failed to save file.");
    }
  };
  

  const handleSubmit = async () => {
    const wordCount = text.trim().split(/\s+/).length;

    if (tokens === null) {
      setError("Loading tokens...");
      return;
    }

    if (tokens < wordCount) {
      setError("Not enough tokens to submit this text!");
      return;
    }

    try {
      // Deduct tokens first
      const { error } = await supabase
        .from('profiles')
        .update({ tokens: tokens - wordCount })
        .eq('id', userId);

      if (error) {
        setError("Token deduction failed.");
        return;
      }

      setTokens(tokens - wordCount); // Update UI

      // Submit the text to backend
      const response = await axios.post("http://localhost:5000/submit", {
        username: userId,
        text,
      });

      setCorrectedText(response.data.text);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || "Submission failed");
    }
  };

  const handlePurchaseTokens = async (amount) => {
    try {
      const response = await axios.post("http://localhost:5000/purchase-tokens", {
        username: userId,
        tokensToAdd: amount,
      });
  
      setTokens(response.data.tokens); // Update the token balance
      setError(null);
      alert(`Successfully purchased ${amount} tokens!`);
    } catch (err) {
      setError(err.response?.data?.error || "Purchase failed");
    }
  };
  

  const handleLLMCorrection = async () => {
    try {
      const response = await axios.post("http://localhost:5000/llm-correct", {
        username: userId,
        text,
      });
      const corrected = response.data.correctedText;
      setCorrectedText(corrected);
      setError(null);
      setShowCorrection(true);
      setDifferences(highlightDifferences(text, corrected)); 
    } catch (err) {
      setError("LLM correction failed");
    }
  };

  const handleSaveToFile = () => {
    if (!correctedText) {
      alert("No text to save!");
      return;
    }
    const blob = new Blob([removeHTMLTags(correctedText)], { type: "text/plain;charset=utf-8" });
    saveAs(blob, "corrected_text.txt");
  };

  const handleAcceptCorrection = async () => {
    setText(removeHTMLTags(correctedText));
    setCorrectedText(null);
    setError(null);
    setShowCorrection(false);
  };

  const handleRejectCorrection = async () => {
    setCorrectedText(null);
    setError(null);
    setShowCorrection(false);
  };

  const removeHTMLTags = (text) => {
    return text.replace(/<\/?strong>/g, "").replace(/<\/?del>/g, "");
  };

  const highlightDifferences = (original, modified) => {
    const diff = diffWords(original, modified);
    let result = "";

    diff.forEach((part) => {
      if (part.added) {
        result += `<strong style="color: green;">${part.value}</strong>`;
      } else if (part.removed) {
        result += `<del style="color: red;">${part.value}</del>`;
      } else {
        result += part.value;
      }
    });

    return result;
  };

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h1 className="text-xl font-bold mb-4">Paid Text Correction System</h1>
      <button
        className="bg-gray-600 text-white px-4 py-2 my-4"
        onClick={() => navigate("/my-files")}
      >
        📂 View My Saved Files
      </button>

      <textarea
        className="w-full border p-2"
        rows="5"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Enter text..."
      ></textarea>

      <p className="mt-2">Available Tokens: {tokens !== null ? tokens : "Loading..."}</p>
      {error && <p className="text-red-500">{error}</p>}

      <div className="flex flex-wrap gap-2 mt-2">
        <button
          className="bg-blue-500 text-white px-4 py-2"
          onClick={handleSubmit}
        >
          Submit Text
        </button>

        <button
          className="bg-blue-700 text-white px-4 py-2"
          onClick={handleLLMCorrection}
        >
          LLM Correction
        </button>
        <div className="flex flex-wrap gap-2 mt-4">
          <h2 className="text-lg font-semibold mb-2">Purchase Tokens</h2>
          {[10, 50, 100].map((amount) => (
            <button
              key={amount}
              className="bg-green-500 text-white px-4 py-2"
              onClick={() => handlePurchaseTokens(amount)}
            >
              Buy {amount} Tokens
            </button>
          ))}
        </div>
        {text && (
          <button
            className="bg-purple-500 text-white px-4 py-2"
            onClick={handleSaveToFile}
          >
            Save As...
          </button>
        )}
      </div>

      <input
        type="file"
        className="mt-2"
        onChange={(e) => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = () => {
              setText(reader.result);
            };
            reader.readAsText(file);
          }
        }}
      />

      {showCorrection && (
        <div className="flex gap-2 mt-4">
          <button
            className="bg-green-500 text-white px-4 py-2"
            onClick={handleAcceptCorrection}
          >
            Accept Correction
          </button>
          <button
            className="bg-red-500 text-white px-4 py-2"
            onClick={handleRejectCorrection}
          >
            Reject Correction
          </button>
        </div>
      )}

      {correctedText && (
        <div className="mt-4 p-2 border bg-gray-100">
          <h2 className="font-semibold mb-2">Corrected Text:</h2>
          <p
            className="text-lg whitespace-pre-wrap"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(differences),
            }}
          />
        </div>
      )}

      <input
        className="border p-2 mt-2 w-full"
        placeholder="Enter title here..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <button
        className="bg-green-600 text-white px-4 py-2 mt-2"
        onClick={handleSaveToSupabase}
      >
        Save to Cloud
      </button>

    </div>
  );
}
