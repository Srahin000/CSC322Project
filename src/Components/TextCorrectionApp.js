import { useState } from "react";
import axios from "axios";
import DOMPurify from "dompurify"; 
import { saveAs } from "file-saver"; 

export default function TextCorrectionApp() {
  const [text, setText] = useState("");
  const [tokens, setTokens] = useState(100);
  const [correctedText, setCorrectedText] = useState(null);
  const [error, setError] = useState(null);
  const [showCorrection, setShowCorrection] = useState(false);

  const handleSubmit = async () => {
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
    try {
      const response = await axios.post("http://localhost:5000/llm-correct", {
        username: "user1",
        text,
      });
      setCorrectedText(response.data.correctedText);
      setError(null);
      setShowCorrection(true);
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
  

  const removeHTMLTags = (text) => {
    return text.replace(/<\/?strong>/g, "");
  }

  const handleAcceptCorrection = async () => {
    try {
      const response = await axios.post("http://localhost:5000/accept-llm-correction", {
        username: "user1",
        acceptedChanges: text.length,
      });
      setTokens(response.data.tokens);
      setText(removeHTMLTags(correctedText));
      setCorrectedText(null);
      setError(null);
      setShowCorrection(false);
    } catch (err) {
      setError("Acceptance of correction failed");
    }
  };

  const handleRejectCorrection = async () => {
    try {
      const response = await axios.post("http://localhost:5000/reject-llm-correction", {
        username: "user1",
        reason: "Spam",
        superUserApproval: true,
      });
      setTokens(response.data.tokens);
      setCorrectedText(null);
      setError(null);
      setShowCorrection(false);
    } catch (err) {
      setError("Rejection of correction failed");
    }
  };

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h1 className="text-xl font-bold mb-4">Text Correction System</h1>
      <textarea
        className="w-full border p-2"
        rows="5"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Enter text..."
      ></textarea>
      <p className="mt-2">Available Tokens: {tokens}</p>
      {error && <p className="text-red-500">{error}</p>}
      <button
        className="mt-2 bg-blue-500 text-white px-4 py-2"
        onClick={handleSubmit}
      >
        Submit Text
      </button>
      <button
        className="mt-2 ml-2 bg-blue-700 text-white px-4 py-2"
        onClick={handleLLMCorrection}
      >
        LLM Correction
      </button>
      {text && (<button
            className="mt-2 ml-2 bg-purple-500 text-white px-4 py-2"
            onClick={handleSaveToFile}
            >
            Save As...
            </button>
      )}
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
      {showCorrection && (<div>
        <button
            className="mt-2 bg-green-500 text-white px-4 py-2"
            onClick={handleAcceptCorrection}
        >
            Accept Correction
        </button>
        <button
            className="mt-2 ml-2 bg-red-500 text-white px-4 py-2"
            onClick={handleRejectCorrection}
        >
            Reject Correction
        </button>
      </div>
      )}
      
      {correctedText && (
        <div className="mt-4 p-2 border bg-gray-100">
            <h2 className="font-semibold">Corrected Text:</h2>
            <p
            className="text-lg"
            dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(correctedText),
            }}
            />
        </div>
        )}


    </div>
  );
}
