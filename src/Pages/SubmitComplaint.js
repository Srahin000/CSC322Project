// Allows users to submit complaints about collaborators on shared documents
// Provides dropdowns to select problematic text and collaborator

import SidebarMenu from "../Components/SidebarMenu";
import { useState, useEffect } from "react";
import supabase from "../config/supabaseClient";
import { useParams } from "react-router-dom";

export default function SubmitComplaint() {
  const [texts, setTexts] = useState([]); // All texts user can complain about
  const [selectedTextId, setSelectedTextId] = useState("");
  const [collaborators, setCollaborators] = useState([]); // Potential complaint targets
  const [selectedCollaborator, setSelectedCollaborator] = useState("");
  const [complaintText, setComplaintText] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Fetch all texts user has access to (owned or collaborated)
  useEffect(() => {
    const fetchTexts = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
  
      // 1. Fetch texts where user is the **owner**
      const { data: ownedTexts, error: ownedError } = await supabase
        .from('texts')
        .select('id, title')
        .eq('user_id', session.user.id);
  
      // 2. Fetch texts where user is a **collaborator**
      const { data: collabData, error: collabError } = await supabase
        .from('text_collaborators')
        .select('text_id')
        .eq('user_id', session.user.id);
  
      const textIds = (collabData || []).map(c => c.text_id);
      let collaboratedTexts = [];
      
      if (textIds.length) {
        const { data: textsData } = await supabase
          .from('texts')
          .select('id, title')
          .in('id', textIds);
        collaboratedTexts = textsData || [];
      }
  
      const allTexts = [...(ownedTexts || []), ...collaboratedTexts];
      
      setTexts(allTexts);
    };
  
    fetchTexts();
  }, []);
  
  // Fetch collaborators when text is selected
  useEffect(() => {
    const fetchCollaborators = async () => {
      if (!selectedTextId) {
        setCollaborators([]);
        setSelectedCollaborator("");
        return;
      }
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      // Get all collaborators except current user
      const { data: collabData } = await supabase
        .from('text_collaborators')
        .select('user_id')
        .eq('text_id', parseInt(selectedTextId));
        
      const userIds = (collabData || []).map(c => c.user_id).filter(id => id !== session.user.id);
      
      if (userIds.length) {
        const { data: userProfiles } = await supabase
          .from('profiles')
          .select('id, email')
          .in('id', userIds);
        setCollaborators(userProfiles || []);
      } else {
        setCollaborators([]);
      }
      setSelectedCollaborator("");
    };
    fetchCollaborators();
  }, [selectedTextId]);

  // Submit complaint to database
  const handleSubmitComplaint = async () => {
    setError(null);
    setSuccess(null);
    
    // Validate inputs
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setError("Not logged in.");
      return;
    }
    if (!complaintText.trim() || !selectedCollaborator || !selectedTextId) {
      setError("Please select a text, a collaborator, and enter a complaint.");
      return;
    }

    try {
      // Create complaint record
      const { error: complaintError } = await supabase.from("complaints").insert([{
        complainant_id: session.user.id,
        complained_id: selectedCollaborator,
        text_id: selectedTextId,
        reason: complaintText.trim(),
        status: "pending",
      }]);

      if (complaintError) throw complaintError;

      // Set complaint to true in the complained user's profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ complaint: true })
        .eq('id', selectedCollaborator);

        if (profileError) throw profileError;

      setSuccess("Complaint submitted!");
      setComplaintText("");
      setSelectedCollaborator("");
      setSelectedTextId("");
    } catch (error) {
      console.error('Error submitting complaint:', error);
      setError("Failed to submit complaint.");
    }
  };

  return (
    <div className="relative flex h-screen w-screen bg-blue-50">
      <SidebarMenu sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <div className="flex-1 p-6 transition-all duration-200 w-full">
        <div className="bg-white rounded-xl shadow p-8 w-full h-full">
          <h1 className="text-2xl font-extrabold mb-8 text-blue-800">Submit a Complaint</h1>
          
          {/* Text selection dropdown */}
          <select
            className="border p-3 rounded-lg text-lg mb-4 w-full focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            value={selectedTextId}
            onChange={e => setSelectedTextId(e.target.value)}
          >
            <option value="">Select a text</option>
            {texts.map(text => (
              <option key={text.id} value={text.id}>{text.title}</option>
            ))}
          </select>
          
          {/* Collaborator selection (only shows when text is selected) */}
          {selectedTextId && (
            <select
              className="border p-3 rounded-lg text-lg mb-4 w-full focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
              value={selectedCollaborator}
              onChange={e => setSelectedCollaborator(e.target.value)}
            >
              <option value="">Select a collaborator</option>
              {collaborators.map(user => (
                <option key={user.id} value={user.id}>{user.email}</option>
              ))}
            </select>
          )}
          
          {/* Complaint details textarea */}
          <textarea
            className="border p-3 rounded-lg text-lg mb-4 w-full focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            placeholder="Describe the issue..."
            rows={3}
            value={complaintText}
            onChange={e => setComplaintText(e.target.value)}
          />
          
          <button
            className="bg-blue-600 text-white px-6 py-3 mb-4 rounded-lg text-lg font-semibold shadow hover:bg-blue-700 transition"
            onClick={handleSubmitComplaint}
            disabled={!selectedTextId || !selectedCollaborator || !complaintText.trim()}
          >
            Submit Complaint
          </button>
          
          {/* Status messages */}
          {error && <p className="text-red-500 mb-2">{error}</p>}
          {success && <p className="text-green-600 mb-2">{success}</p>}
        </div>
      </div>
    </div>
  );
}