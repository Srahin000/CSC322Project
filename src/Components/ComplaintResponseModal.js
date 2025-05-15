// Handles the display and submission of responses to user complaints. 
// It checks for pending complaints and allows users to respond to them.

import { useState, useEffect } from 'react';
import supabase from '../config/supabaseClient';

export default function ComplaintResponseModal() {
  const [showModal, setShowModal] = useState(false);
  const [complaintReason, setComplaintReason] = useState('');
  const [complaintId, setComplaintId] = useState(null);
  const [response, setResponse] = useState('');

  const checkComplaint = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('complaint')
      .eq('id', session.user.id)
      .single();

    if (profile?.complaint) {
      // Fetch the latest pending complaint
      const { data: complaints } = await supabase
        .from('complaints')
        .select('id, reason')
        .eq('complained_id', session.user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1);

      if (complaints && complaints.length > 0) {
        setComplaintReason(complaints[0].reason);
        setComplaintId(complaints[0].id);
        setShowModal(true);
      }
    } else {
      setShowModal(false);
    }
  };

  // Check for complaints on mount and every 5 seconds
  useEffect(() => {
    checkComplaint();
    const interval = setInterval(checkComplaint, 5000);
    return () => clearInterval(interval);
  }, []);

  // Also check when auth state changes
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      checkComplaint();
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleSubmitResponse = async () => {
    if (!response.trim()) {
      alert('Please enter a response.');
      return;
    }

    try {
      // Update the complaint with the response
      const { error } = await supabase
        .from('complaints')
        .update({ response: response.trim() })
        .eq('id', complaintId);

      if (error) throw error;

      // Set complaint to false in profiles
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ complaint: false })
        .eq('id', (await supabase.auth.getSession()).data.session.user.id);

      if (profileError) throw profileError;

      setShowModal(false);
      setResponse('');
      setComplaintReason('');
      setComplaintId(null);
    } catch (error) {
      console.error('Error submitting response:', error);
      alert('Failed to submit response. Please try again.');
    }
  };

  if (!showModal) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-8 max-w-2xl w-full mx-4">
        <h2 className="text-2xl font-bold text-blue-800 mb-4">Complaint Response Required</h2>
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-blue-700 mb-2">Complaint Details:</h3>
          <p className="text-gray-700 bg-blue-50 p-4 rounded-lg">{complaintReason}</p>
        </div>
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-blue-700 mb-2">Your Response:</h3>
          <textarea
            className="w-full p-4 border rounded-lg focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            rows="4"
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder="Please provide your response to the complaint..."
          />
        </div>
        <div className="flex justify-end gap-4">
          <button
            onClick={handleSubmitResponse}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition"
          >
            Submit Response
          </button>
        </div>
      </div>
    </div>
  );
} 