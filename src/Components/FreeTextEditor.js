import { useState, useEffect } from "react";
import axios from "axios";
import DOMPurify from "dompurify";
import { saveAs } from "file-saver";
import { diffWords } from "diff";

const COOLDOWN_STORAGE_KEY = "free_editor_cooldown";

const formatCooldown = (ms) => {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

export default function FreeTextEditor({ onExitFreeMode }) {
  const [text, setText] = useState("");
  const [tokens, setTokens] = useState(20);
  const [correctedText, setCorrectedText] = useState(null);
  const [error, setError] = useState(null);
  const [showCorrection, setShowCorrection] = useState(false);
  const [differences, setDifferences] = useState("");
  const [cooldownEnd, setCooldownEnd] = useState(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem(COOLDOWN_STORAGE_KEY);
    if (saved) {
      const savedTime = new Date(saved);
      if (savedTime > new Date()) {
        setCooldownEnd(savedTime);
        setCooldownRemaining(savedTime - new Date());
      } else {
        localStorage.removeItem(COOLDOWN_STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!cooldownEnd) return;

      const now = new Date();
      const remaining = cooldownEnd - now;

      if (remaining <= 0) {
        setCooldownEnd(null);
        setCooldownRemaining(null);
        localStorage.removeItem(COOLDOWN_STORAGE_KEY);
        alert("✅ Cooldown is over, you can submit again!");
        clearInterval(interval);
      } else {
        setCooldownRemaining(remaining);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [cooldownEnd]);

  const handleSubmit = async () => {
    const wordCount = text.trim().split(/\s+/).length;

    if (cooldownEnd && new Date() < cooldownEnd) {
      setError("You are on cooldown. Try again later.");
      return;
    }

    if (wordCount > 20) {
      triggerCooldown();
      setError("Word limit exceeded! You are on 3 minute cooldown.");
      setText("");
      return;
    }

    try {
      const response = await axios.post("http://localhost:5000/submit", {
        username: "user1",
        text,
      });
      setTokens(response.data.tokens);
      setCorrectedText(response.data.text);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || "Submission failed");
    }
  };

  const handleLLMCorrection = async () => {
    const wordCount = text.trim().split(/\s+/).length;

    if (cooldownEnd && new Date() < cooldownEnd) {
      setError("You are on cooldown. Try again later.");
      return;
    }

    if (wordCount > 20) {
      triggerCooldown();
      setError("Word limit exceeded! You are on 3 minute cooldown.");
      setText("");
      return;
    }

    try {
      const response = await axios.post("http://localhost:5000/free-llm-correct", {
        text,
      });

      if (response.data.correctedText) {
        const corrected = response.data.correctedText;
        setCorrectedText(corrected);
        setError(null);
        setShowCorrection(true);
        setDifferences(highlightDifferences(text, corrected));
      } else {
        setError("No correction received from server");
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || "LLM correction failed";
      setError(errorMessage);
    }
  };

  const triggerCooldown = () => {
    const cooldownTime = new Date(new Date().getTime() + 3 * 60 * 1000);
    setCooldownEnd(cooldownTime);
    localStorage.setItem(COOLDOWN_STORAGE_KEY, cooldownTime.toISOString());
  };

  const handleSaveToFile = () => {
    if (!correctedText) {
      alert("No text to save!");
      return;
    }
    const blob = new Blob([removeHTMLTags(correctedText)], {
      type: "text/plain;charset=utf-8",
    });
    saveAs(blob, "corrected_text.txt");
  };

  const handleAcceptCorrection = () => {
    setText(removeHTMLTags(correctedText));
    setCorrectedText(null);
    setError(null);
    setShowCorrection(false);
  };

  const handleRejectCorrection = () => {
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
      <h1 className="text-xl font-bold mb-4">Free Text Correction (20 Words Limit)</h1>

      <textarea
        className={`w-full border p-2 ${
          cooldownRemaining !== null ? "bg-gray-200 cursor-not-allowed" : ""
        }`}
        rows="5"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          cooldownRemaining !== null ? "You are on cooldown..." : "Enter text (max 20 words)..."
        }
        disabled={cooldownRemaining !== null}
      />

      <p className="mt-2">Available Tokens: {tokens}</p>
      {error && <p className="text-red-500">{error}</p>}

      <div className="flex flex-wrap gap-2 mt-2">
        <button
          className="bg-blue-500 text-white px-4 py-2"
          onClick={handleSubmit}
          disabled={cooldownRemaining !== null}
        >
          Submit Text
        </button>
        <button
          className="bg-blue-700 text-white px-4 py-2"
          onClick={handleLLMCorrection}
          disabled={cooldownRemaining !== null}
        >
          LLM Correction
        </button>
        {text && (
          <button
            className="bg-purple-500 text-white px-4 py-2"
            onClick={handleSaveToFile}
            disabled={cooldownRemaining !== null}
          >
            Save As...
          </button>
        )}
        <button
          className="bg-gray-500 text-white px-4 py-2"
          onClick={onExitFreeMode}
        >
          Back to Sign In
        </button>
      </div>

      {cooldownRemaining !== null && (
        <p className="text-yellow-600 mt-2 font-semibold">
          Cooldown active: {formatCooldown(cooldownRemaining)}
        </p>
      )}

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
    </div>
  );
}
