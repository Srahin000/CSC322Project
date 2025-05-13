import { useState, useEffect } from "react";
import axios from "axios";
import DOMPurify from "dompurify"; 
import { saveAs } from "file-saver"; 
import { diffWords } from "diff"; 
import supabase from "../config/supabaseClient"; // Import Supabase client!
import { useParams } from "react-router-dom"; // 🆕
import { useNavigate } from "react-router-dom";
import { FaBars } from "react-icons/fa";
import SidebarMenu from "./SidebarMenu";




export default function TextCorrectionApp() {
  const [blacklistSuggestion, setBlacklistSuggestion] = useState("");
  const navigate = useNavigate(); // 🆕
  const [blacklistWords, setBlacklistWords] = useState([]);
  const [text, setText] = useState("");
  const [tokens, setTokens] = useState(null); // Initially null
  const [correctedText, setCorrectedText] = useState(null);
  const [error, setError] = useState(null);
  const [showCorrection, setShowCorrection] = useState(false);
  const [differences, setDifferences] = useState(""); 
  const [userId, setUserId] = useState(null); // Save user ID
  const { fileId } = useParams(); // 🆕
  const [title, setTitle] = useState("");
  const [userRole, setUserRole] = useState("");
  const [complaintText, setComplaintText] = useState("");
  const [collaboratorId, setCollaboratorId] = useState("");
  const [collaborators, setCollaborators] = useState([]); // List of users tied to this text
  const [selectedCollaborator, setSelectedCollaborator] = useState(""); // Who to complain about
  const [pendingComplaint, setPendingComplaint] = useState(null);
  const [complaintResponse, setComplaintResponse] = useState('');
  const [isSuspended, setIsSuspended] = useState(false);
  const [checkedSuspension, setCheckedSuspension] = useState(false); // ensures we don't prematurely render
  const [textLocked, setTextLocked] = useState(false);
  const [showSelfCorrection, setShowSelfCorrection] = useState(false);
  const [originalText, setOriginalText] = useState("");
  const [correctionMode, setCorrectionMode] = useState('none'); // 'none', 'llm', 'self'
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isTextAreaDisabled, setIsTextAreaDisabled] = useState(false);
  const [correctionComplete, setCorrectionComplete] = useState(false);
  const [selectedWords, setSelectedWords] = useState([]);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectionModal, setShowRejectionModal] = useState(false);




  useEffect(() => {
    const checkUserStatus = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/');
        return;
      }
  
      setUserId(session.user.id);
  
      // Get role & suspension status
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role, suspended, tokens')
        .eq('id', session.user.id)
        .single();
  
      if (error || !profile) {
        setError("Failed to load profile.");
        return;
      }
  
      setUserRole(profile.role);
      setTokens(profile.tokens);
      setIsSuspended(profile.suspended);
      setCheckedSuspension(true);
    };
  
    checkUserStatus();
  }, []);
  
  // Fetch user session + token balance when app loads

  const censorBlacklistedWords = (inputText) => {
    let censored = inputText;
  
    blacklistWords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const replacement = '*'.repeat(word.length);
      censored = censored.replace(regex, replacement);
    });
  
    return censored;
  };
  const handleBlacklistSuggestion = async () => {
    if (!blacklistSuggestion.trim()) {
      alert("Please enter a valid word.");
      return;
    }
  
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setError("No active session");
      return;
    }
  
    try {
      const { error } = await supabase
        .from('blacklist_requests') // 🛑 Make sure this matches your table name
        .insert([{
          suggested_by: session.user.id,
          word: blacklistSuggestion.trim().toLowerCase(),
          status: 'pending',
        }]);
  
      if (error) {
        console.error(error);
        alert("Failed to submit word.");
      } else {
        alert("Word submitted for review!");
        setBlacklistSuggestion(""); // Clear input
      }
    } catch (err) {
      console.error(err);
      alert("Submission failed");
    }
  };
  
  
  // New helper function to update text state with censorship
  const applyBlacklist = () => {
    let censored = text;
    let found = false;
  
    blacklistWords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      if (regex.test(censored)) {
        found = true;
        const replacement = '*'.repeat(word.length);
        censored = censored.replace(regex, replacement);
      }
    });
  
    if (found) {
      alert("Your text contains blacklisted words which were censored.");
    }
  
    setText(censored);
    return censored;
  };
  
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
  
      // Fetch blacklist
      const { data: blacklistData, error: blacklistError } = await supabase
        .from('blacklist_requests') // ⬅️ replace with your actual table name
        .select('word')
        .eq('status', 'approved'); // Only approved words
  
      if (blacklistError) {
        console.error("Error fetching blacklist:", blacklistError);
      } else {
        setBlacklistWords(blacklistData.map(item => item.word.toLowerCase()));
      }
  
      // Fetch file if editing
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
      // Fetch collaborators for this file
        const { data: collabData, error: collabError } = await supabase
        .from('text_collaborators')
        .select('user_id, adder_id')
        .eq('text_id', fileId);

        if (!collabError) {
        // Collect unique users involved in collaboration
        const usersInvolved = new Set();
        collabData.forEach(({ user_id, adder_id }) => {
          if (user_id) usersInvolved.add(user_id);
          if (adder_id) usersInvolved.add(adder_id);
        });

        // Remove current user from the set
        usersInvolved.delete(session.user.id);

        // Fetch user profiles (optional: names or emails)
        const { data: userProfiles } = await supabase
          .from('profiles')
          .select('id, email')
          .in('id', [...usersInvolved]);

        setCollaborators(userProfiles || []);
        }

    };

    
    fetchUserData();
  }, [fileId]);
  

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
    const censored = applyBlacklist();
  
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
        await supabase
          .from('texts')
          .update({ title, content: censored, updated_at: new Date().toISOString() })
          .eq('id', fileId);
      } else {
        await supabase
          .from('texts')
          .insert([{ user_id: session.user.id, title, content: censored }]);
      }
      alert("File saved successfully!");
    } catch (error) {
      console.error(error);
      alert("Failed to save file.");
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
    setError(null);
    setCorrectionMode('llm');
    setIsTextAreaDisabled(true);
    setCorrectionComplete(false);
    try {
      const response = await axios.post("http://localhost:5000/llm-correct", {
        username: userId,
        text: text,
      });

      const corrected = response.data.correctedText;
      setCorrectedText(corrected);
      setTokens(response.data.tokens);
      setShowCorrection(true);
      
      // Calculate differences for highlighting
      const diff = highlightDifferences(text, removeHTMLTags(corrected));
      setDifferences(diff);
    } catch (error) {
      setError(error.response?.data?.error || "Failed to correct text");
      setIsTextAreaDisabled(false);
    }
  };

  // Add function to handle word selection
  const handleWordSelection = (word) => {
    if (selectedWords.includes(word)) {
      setSelectedWords(selectedWords.filter(w => w !== word));
    } else {
      setSelectedWords([...selectedWords, word]);
    }
  };

  const handleSelfCorrection = async () => {
    setOriginalText(text); // Save original text for comparison
    setShowSelfCorrection(true);
    setIsTextAreaDisabled(false); // Enable text editing
    setCorrectionMode('self');
    setShowCorrection(false); // Hide the LLM correction output
    setCorrectedText(null); // Clear the corrected text
  };

  const handleSubmitSelfCorrection = async () => {
    // Calculate word differences
    const originalWords = originalText.split(/\s+/).filter(word => word.length > 0);
    const correctedWords = text.split(/\s+/).filter(word => word.length > 0);
    const changedWords = correctedWords.filter((word, index) => word !== originalWords[index]);

    if (changedWords.length === 0) {
      setError("No changes detected. Please make corrections before submitting.");
      return;
    }

    try {
      const response = await axios.post("http://localhost:5000/self-correct", {
        username: userId,
        correctedWords: changedWords,
      });

      setTokens(response.data.tokens);
      setShowSelfCorrection(false);
      setCorrectionMode('none');
      setCorrectionComplete(true);
      setIsTextAreaDisabled(false); // Keep text area enabled after self-correction
    } catch (error) {
      setError(error.response?.data?.error || "Failed to self-correct");
    }
  };

  const handleSaveToFile = () => {
    if (!text) {
      alert("No text to save!");
      return;
    }
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    saveAs(blob, "text.txt");
  };

  const handleAcceptCorrection = async () => {
    setText(removeHTMLTags(correctedText));
    setCorrectedText(null);
    setError(null);
    setShowCorrection(false);
    setTextLocked(false);
    setIsTextAreaDisabled(false);
    setCorrectionComplete(true);
  };

  const handleRejectCorrection = async () => {
    setShowRejectionModal(true);
  };

  const handleSubmitRejection = async () => {
    if (!rejectionReason.trim()) {
      setError("Please provide a reason for rejection.");
      return;
    }

    try {
      await axios.post("http://localhost:5000/submit-rejection", {
        user_id: userId,
        text_id: fileId,
        original_text: text,
        llm_output: correctedText,
        reason: rejectionReason.trim()
      });

      setCorrectedText(null);
      setError(null);
      setShowCorrection(false);
      setShowRejectionModal(false);
      setRejectionReason("");
    } catch (error) {
      setError(error.response?.data?.error || "Failed to submit rejection reason.");
    }
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

  const handleParaphrase = async () => {
    if (!text.trim()) {
      setError("Please enter some text to paraphrase.");
      return;
    }

    if (tokens < 10) {
      setError("You need at least 10 tokens to use the paraphrase feature.");
      return;
    }

    try {
      const response = await axios.post("http://localhost:5000/paraphrase", {
        username: userId,
        text: text.trim(),
      });

      setCorrectedText(response.data.paraphrasedText);
      setDifferences(highlightDifferences(text, response.data.paraphrasedText));
      setShowCorrection(true);
      setTokens(response.data.tokens);
      setError(null);
    } catch (error) {
      setError(error.response?.data?.error || "Failed to paraphrase text.");
    }
  };

  // Sidebar navigation items
  const sidebarItems = [
    { label: "My Files", onClick: () => navigate("/my-files") },
    { label: "Purchase Tokens", onClick: () => navigate("/purchase-tokens") },
    { label: "Collaboration Invites", onClick: () => navigate("/collaboration-invites") },
    { label: "Submit Blacklist Word", onClick: () => navigate("/submit-blacklist") },
    { label: "Submit Complaint", onClick: () => navigate("/submit-complaint") },
  ];

  if (!checkedSuspension) {
    return <p className="p-4 text-center">Checking user status...</p>;
  }
  if (isSuspended) {
    return (
      <div className="p-6 max-w-xl mx-auto text-center text-red-600 font-semibold">
        🚫 Your account is currently suspended. Please contact support.
      </div>
    );
  }

  return (
    <div className="relative flex h-screen w-screen bg-blue-50">
      <SidebarMenu sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      {/* Hamburger icon */}
      <button
        className="fixed top-4 left-4 z-40 bg-gray-900 text-white p-2 rounded shadow-lg focus:outline-none"
        onClick={() => setSidebarOpen((open) => !open)}
        aria-label="Open menu"
      >
        <FaBars size={24} />
      </button>
      {/* Main content area */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="bg-white rounded-xl shadow p-8 w-full h-full">
          <h1 className="text-3xl font-extrabold mb-8 text-blue-800">Paid Text Correction System</h1>
          <input
            className="border p-3 rounded-lg text-lg mb-6 w-full focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            placeholder="Enter title here..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="flex flex-col gap-6">
            <textarea
              className="border p-4 mr-20 rounded-lg text-lg shadow-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 w-full"
              rows="10"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter text..."
              disabled={isTextAreaDisabled}
            ></textarea>
            <p className="text-lg font-medium text-blue-900">Available Tokens: {tokens !== null ? tokens : "Loading..."}</p>
            {error && <p className="text-red-500 font-semibold mt-2">{error}</p>}
            
            <div className="flex flex-col gap-4">
              <div className="flex gap-4">
                <button
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg text-lg font-semibold shadow hover:bg-blue-700 transition"
                  onClick={handleLLMCorrection}
                  disabled={isTextAreaDisabled}
                >
                  Submit for LLM Correction
                </button>
                <button
                  className="bg-purple-600 text-white px-6 py-3 rounded-lg text-lg font-semibold shadow hover:bg-purple-700 transition"
                  onClick={handleParaphrase}
                  disabled={isTextAreaDisabled}
                >
                  Paraphrase Text (10 tokens)
                </button>
              </div>

              {/* Correction output */}
              {showCorrection && correctedText && (
                <div className="p-6 border rounded-xl bg-blue-50 shadow-inner">
                  <h2 className="text-2xl font-semibold mb-4 text-blue-800">Corrected Text:</h2>
                  <div
                    className="prose max-w-none mb-4"
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(differences)
                    }}
                  />
                  <div className="flex gap-4 mt-4">
                    <button
                      className="bg-blue-600 text-white px-6 py-2 rounded-lg text-lg font-semibold hover:bg-blue-700 transition"
                      onClick={handleAcceptCorrection}
                    >
                      Accept Correction
                    </button>
                    <button
                      className="bg-blue-500 text-white px-6 py-2 rounded-lg text-lg font-semibold hover:bg-blue-600 transition"
                      onClick={handleRejectCorrection}
                    >
                      Reject Correction
                    </button>
                    <button
                      className="bg-blue-400 text-white px-6 py-2 rounded-lg text-lg font-semibold hover:bg-blue-500 transition"
                      onClick={handleSelfCorrection}
                    >
                      Self Correct
                    </button>
                  </div>
                </div>
              )}

              {/* Rejection Modal */}
              {showRejectionModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-xl p-8 max-w-2xl w-full mx-4">
                    <h2 className="text-2xl font-bold text-blue-800 mb-4">Rejection Reason</h2>
                    <textarea
                      className="w-full p-4 border rounded-lg focus:ring-2 focus:ring-blue-200 focus:border-blue-400 mb-4"
                      rows="4"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Please explain why you are rejecting this correction..."
                    />
                    <div className="flex justify-end gap-4">
                      <button
                        onClick={() => setShowRejectionModal(false)}
                        className="bg-gray-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-600 transition"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSubmitRejection}
                        className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition"
                      >
                        Submit Rejection
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Self Correction Interface */}
              {showSelfCorrection && (
                <div className="p-6 border rounded-xl bg-blue-50 shadow-inner">
                  <h2 className="text-2xl font-semibold mb-4 text-blue-800">Self Correction Mode</h2>
                  <p className="mb-4 text-blue-700">Edit the text above to make your corrections. Click Submit when done.</p>
                  <div className="flex gap-4">
                    <button
                      className="bg-blue-600 text-white px-6 py-2 rounded-lg text-lg font-semibold hover:bg-blue-700 transition"
                      onClick={handleSubmitSelfCorrection}
                    >
                      Submit Corrections
                    </button>
                    <button
                      className="bg-blue-400 text-white px-6 py-2 rounded-lg text-lg font-semibold hover:bg-blue-500 transition"
                      onClick={() => {
                        setShowSelfCorrection(false);
                        setText(originalText); // Restore original text
                        setIsTextAreaDisabled(true);
                        setCorrectionMode('none');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Save buttons - only show when not in correction process */}
              {!showCorrection && !showSelfCorrection && text && (
                <>
                  <button
                    className="bg-blue-600 text-white px-6 py-3 rounded-lg text-lg font-semibold shadow hover:bg-blue-700 transition"
                    onClick={handleSaveToFile}
                  >
                    Save to Device
                  </button>
                  <button
                    className="bg-blue-500 text-white px-6 py-3 rounded-lg text-lg font-semibold shadow hover:bg-blue-600 transition"
                    onClick={handleSaveToSupabase}
                  >
                    Save to Cloud
                  </button>
                </>
              )}
              <input
                type="file"
                className="block text-sm text-blue-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
