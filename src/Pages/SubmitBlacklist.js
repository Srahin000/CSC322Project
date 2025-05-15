// Allows users to suggest words for the content blacklist system
// Submits words for admin review to potentially block inappropriate content

import SidebarMenu from "../Components/SidebarMenu";
import { useState } from "react";
import supabase from "../config/supabaseClient";

export default function SubmitBlacklist() {
  const [blacklistSuggestion, setBlacklistSuggestion] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Handle submission of blacklist word suggestion
  const handleBlacklistSuggestion = async () => {
    if (!blacklistSuggestion.trim()) {
      setError("Please enter a valid word.");
      setSuccess(null);
      return;
    }
    setError(null);
    setSuccess(null);
    // Check user session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setError("No active session");
      return;
    }
    try {
      // Insert suggestion into blacklist_requests table
      const { error } = await supabase
        .from('blacklist_requests')
        .insert([{
          suggested_by: session.user.id,
          word: blacklistSuggestion.trim().toLowerCase(),
          status: 'pending',
        }]);
      if (error) {
        setError("Failed to submit word.");
        setSuccess(null);
      } else {
        setSuccess("Word submitted for review!");
        setBlacklistSuggestion("");
      }
    } catch (err) {
      setError("Submission failed");
      setSuccess(null);
    }
  };

  return (
    <div className="relative flex h-screen w-screen bg-blue-50">
      <SidebarMenu sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <div className="flex-1 p-6 transition-all duration-200 w-full">
        <div className="bg-white rounded-xl shadow p-8 w-full h-full">
          <h1 className="text-2xl font-extrabold mb-8 text-blue-800">Suggest Blacklist Word</h1>
          {/* Input field for blacklist word */}
          <input
            className="border p-3 rounded-lg text-lg mb-4 w-full focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            type="text"
            placeholder="Enter a word you want blacklisted"
            value={blacklistSuggestion}
            onChange={(e) => setBlacklistSuggestion(e.target.value)}
          />
          <button
            className="bg-blue-600 text-white px-6 py-3 mb-4 rounded-lg text-lg font-semibold shadow hover:bg-blue-700 transition"
            onClick={handleBlacklistSuggestion}
          >
            Submit Blacklist Word
          </button>
          {/* Display error/success messages */}
          {error && <p className="text-red-500 mb-2">{error}</p>}
          {success && <p className="text-green-600 mb-2">{success}</p>}
        </div>
      </div>
    </div>
  );
}