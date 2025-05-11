import { useState, useEffect } from "react";
import axios from "axios";
import DOMPurify from "dompurify"; 
import { saveAs } from "file-saver"; 
import { diffWords } from "diff"; 
import supabase from "../config/supabaseClient"; // Import Supabase client!
import { useParams } from "react-router-dom"; // 🆕
import { useNavigate } from "react-router-dom";


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
    const censored = applyBlacklist();
  
    try {
      const response = await axios.post("http://localhost:5000/llm-correct", {
        username: userId,
        text: censored,
      });
      const corrected = response.data.correctedText;
      setCorrectedText(corrected);
      setError(null);
      setShowCorrection(true);
      setTextLocked(true); // lock editing
      setDifferences(highlightDifferences(censored, corrected)); 
    } catch (err) {
      setError("LLM correction failed");
    }
  };

  const handleSelfCorrection = async () => {
    const censored = applyBlacklist();
  
    try {
      const response = await axios.post("http://localhost:5000/self-correct", {
        username: userId,
        text: censored,
      });
      const corrected = response.data.correctedText;
      setCorrectedText(corrected);
      setError(null);
      setShowCorrection(true);
      setTextLocked(true); // lock editing
      setDifferences(highlightDifferences(censored, corrected)); 
    } catch (err) {
      setError("Self correction failed");
    }
  }
  

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
    setTextLocked(false);

  };

  const handleRejectCorrection = async () => {
    setCorrectedText(null);
    setError(null);
    setShowCorrection(false);
    setTextLocked(false);

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
    
    <div className="p-4 max-w-xl mx-auto">

      <h1 className="text-xl font-bold mb-4">Paid Text Correction System</h1>

      {userRole === 'super' && (
        <button
          className="bg-yellow-500 text-white px-4 py-2 mb-4"
          onClick={() => navigate("/super-dashboard")}
        >
          🏠 Go Back to Super Dashboard
        </button>
      )}

      <button
        className="bg-gray-600 text-white px-4 py-2 my-4"
        onClick={() => navigate("/my-files")}
      >
        📂 View My Saved Files
      </button>
      {pendingComplaint && (
        <div className="fixed top-0 left-0 w-full h-full bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded max-w-md w-full">
            <h2 className="text-xl font-semibold mb-2">You have a pending complaint</h2>
            <p className="mb-4 text-red-700"><strong>Reason:</strong> {pendingComplaint.reason}</p>
            <textarea
              className="w-full border p-2 mb-4"
              rows={4}
              placeholder="Respond to the complaint..."
              value={complaintResponse}
              onChange={(e) => setComplaintResponse(e.target.value)}
            />
            <button
              className="bg-green-600 text-white px-4 py-2"
              onClick={async () => {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session || !pendingComplaint?.id) return;

                const { error } = await supabase
                  .from('complaints')
                  .update({ response: complaintResponse, status: 'responded' })
                  .eq('id', pendingComplaint.id);

                if (error) {
                  alert('Failed to submit response');
                  return;
                }

                localStorage.removeItem('pendingComplaint');
                setPendingComplaint(null);
                alert('Response submitted');
              }}
            >
              Submit Response
            </button>
          </div>
        </div>
      )}



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
          className="bg-blue-700 text-white px-4 py-2"
          onClick={handleLLMCorrection}
        >
          Submit for LLM Correction
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
      <div className="mt-6">
          <h2 className="text-lg font-semibold mb-2">Suggest Blacklist Word</h2>
          <input
            className="border p-2 w-full mb-2"
            type="text"
            placeholder="Enter a word you want blacklisted"
            value={blacklistSuggestion}
            onChange={(e) => setBlacklistSuggestion(e.target.value)}
          />
          <button
            className="bg-red-500 text-white px-4 py-2"
            onClick={handleBlacklistSuggestion}
          >
            Submit Blacklist Word
          </button>
        </div>
        <div className="mt-6">
          <h2 className="text-lg font-semibold mb-2">Submit a Complaint</h2>

          <select
            className="border p-2 w-full mb-2"
            value={selectedCollaborator}
            onChange={(e) => setSelectedCollaborator(e.target.value)}
          >
            <option value="">Select a collaborator</option>
            {collaborators.map((user) => (
              <option key={user.id} value={user.id}>
                {user.email}
              </option>
            ))}
          </select>

          <textarea
            className="border p-2 w-full mb-2"
            placeholder="Describe the issue..."
            rows={3}
            value={complaintText}
            onChange={(e) => setComplaintText(e.target.value)}
          />

          <button
            className="bg-orange-500 text-white px-4 py-2"
            onClick={async () => {
              const { data: { session } } = await supabase.auth.getSession();
              if (!session) {
                alert("Not logged in.");
                return;
              }

              if (!complaintText.trim() || !selectedCollaborator || !fileId) {
                alert("Please select a collaborator, enter a complaint, and ensure a file is loaded.");
                return;
              }

              const { error } = await supabase.from("complaints").insert([
                {
                  complainant_id: session.user.id,
                  complained_id: selectedCollaborator,
                  text_id: fileId,
                  reason: complaintText.trim(),
                  status: "pending",
                },
              ]);

              if (error) {
                alert("Failed to submit complaint.");
                console.error(error);
              } else {
                alert("Complaint submitted!");
                setComplaintText("");
                setSelectedCollaborator("");
              }
            }}
          >
            Submit Complaint
          </button>
        </div>

    </div>
  );
}
